    //var mark_points   = {}
	//var black_hosts   = []
	//var articles      = {}
	//var article_style = {}
	
	//common
	//var is_run_ready_data    = false
	//var notificationId       = null
	//var t_close_notification = null
	//var t_deal_onActivated   = null
	
	//var article_html=null
	//var path_name_base64_arr_is_getting_rm_data=[]
	
	import md5 from "./md5.js"
	
	chrome.contextMenus.removeAll()
	
	chrome.contextMenus.create({
        type: 'normal',
        title: language("mark_current_node"),
		id: "write_to_desc",
		contexts: ['selection'],
		documentUrlPatterns:["http://*/*", "https://*/*", "chrome-extension://"+chrome.runtime.id+"/pages/reading_model.html"],
		//onclick: write_to_desc
    })
	
	/* chrome.contextMenus.create({
        type: 'normal',
        title: language("open_reading_model"),
		id: "reading_mode",
		contexts: ['all'], */
		//documentUrlPatterns:["http://*/*", "https://*/*"],
		/* onclick: open_reading_mode_by_contextmenu
    }) */
	
	chrome.contextMenus.onClicked.addListener((info, tab)=>{
		if(info.menuItemId === "write_to_desc"){
			write_to_desc()
		}
	})
	
	//有些页面，链接改变了，但页面不会再触发$(document).ready()，也就是这时的 path_name 并未更新……
	//解决方法：chrome.tabs.onUpdated(()=>{})
	chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){ //是否和 message.todo=="get_mark_point" 重复？
		if(/^https?:\/\//.test(tab.url) || (/^chrome-extension:\/\//.test(tab.url) && tab.url.indexOf("chrome-extension://"+chrome.runtime.id) !== -1)){
		    if(changeInfo.status=="complete"){
		        var target_tab_id=tabId
				get_mark_point(target_tab_id, (data)=>{
					var mark_point=data[0]
					var is_reading_model=data[1]
					
					send_to_tab(target_tab_id, "callback_mark_point", mark_point)
					
					if(tab.active){
					    changeBadgeText(mark_point[is_reading_model?"points_reading_model":"points_normal"].length)
					}
				})
		    }
		}
	})
	
	chrome.tabs.onActivated.addListener(function(active_tab_info){  //创建、切换、移除均会触发这里
		//alert(JSON.stringify(active_tab_info))
		var target_tab_id=active_tab_info.tabId
		
		storage_get("t_deal_onActivated", (c)=>{
			var t_deal_onActivated=c.t_deal_onActivated
			
			if(t_deal_onActivated !== undefined){
		    	if(t_deal_onActivated !== null){
		        	clearTimeout(t_deal_onActivated)
		        }
		    }
			
			t_deal_onActivated=setTimeout(deal_onActivated, 100, target_tab_id)
			storage_set({
				t_deal_onActivated
			})
		})
		
	})
	
	chrome.runtime.onInstalled.addListener(function(request, sender, sendResponse){
		chrome.storage.local.get(null, function(c){
			var app_version=chrome.runtime.getManifest().version
			var db_keys=Object.keys(c)
			var data_obj={}
			
			if(db_keys.indexOf("mark_points") == -1){ //标记过滚动位置的页面
				data_obj.mark_points = {}
			}
			if(db_keys.indexOf("black_hosts") == -1){ //不需要隐藏滚动条的页面
				data_obj.black_hosts = []
			}
			if(db_keys.indexOf("articles") == -1){
				data_obj.articles = {}
			}
			if(db_keys.indexOf("article_style") == -1){
				data_obj.article_style = {"width":"narrow", "is_dark":false}
			}
			
			if(db_keys.indexOf("setting_data") == -1){
				data_obj.setting_data = {
					top_progress_color: "blue",
					scroll_bar_color: "rgba(5, 230, 215, 0.6)",
				    scroll_bar_value: "no",
					is_top_progress_auto_hide: false,
					is_need_scrollbar: true,
					is_fixed_scroll_bar: true,
					is_use_side_click: true,
					is_use_mark_point: true,
					is_display_points_num: true,
					is_reading_mode_auto_full_screen: false
				}
				// is_need_scrollbar: 是否需要显示自定义滚动条（鼠标移动到最右侧时显示 或者 固定显示）
			}
			
			if(db_keys.indexOf("is_init") == -1){
				data_obj.is_init = "yes"
				
				new_install(db_keys)
				chrome.tabs.create({
					url: "../pages/welcome_"+(language("lang")=="zh_cn"?"zh":"en")+".html"
				})
			}
			else{
				storage_get(["app_version", "is_dev_client"], (c)=>{
				    if(c.app_version !== "1.4.5"){ //必要，避免多次触发
						/* chrome.tabs.create({
				        	url: "../pages/update_desc.html"
				        }) */
		            }
					
				    if(typeof c.is_dev_client == "undefined"){
				        new_install(db_keys)
				    }
				})
			}
			
			//写入数据
			if(Object.keys(data_obj).length>0){
				storage_set(data_obj, ()=>{
					//ready_data()
				})
			}
			else{//无需写入数据
				//ready_data()
			}
		    
		    storage_set({
		    	app_version: chrome.runtime.getManifest().version
		    })
		})
	})
	
	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
		var todo =message.todo
		var extra=message.extra?message.extra:{}
		
		if(todo=="get_mark_point"){
			var sender_tab=sender.tab
			var path_name_base64=extra.path_name_base64
			var mark_point={points_normal:[], points_reading_model:[]}
			
			storage_get("mark_points", (c)=>{
				var mark_points=c.mark_points || {}
				
			    if(typeof mark_points[path_name_base64] !== "undefined"){
			        mark_point=mark_points[path_name_base64]
			    }
			    //sendResponse(mark_point)
				send_to_tab(sender.tab.id, "callback_get_mark_point", {"mark_point": mark_point})
			    
			    if(sender_tab.active){
			        changeBadgeText(mark_point.points_normal.length)
			    }
			})
		}
		
		else if(todo=="set_mark_point"){
			//var id_from_tab=typeof sender.tab=="undefined"?"":sender.tab.id
			var path_name_base64 = extra.path_name_base64
			var mark_point       = extra.mark_point
			
			storage_get("mark_points", (c)=>{
				var mark_points=c.mark_points || {}
				
			    if(mark_point.points_reading_model.length==0 && mark_point.points_normal.length==0){
			    	delete mark_points[path_name_base64]
			    }
			    else{
			    	mark_points[path_name_base64]=mark_point
			    }
			    storage_set({"mark_points":mark_points})
			})
			
			changeBadgeText(mark_point[extra.is_reading_model?"points_reading_model":"points_normal"].length)
			
			sendMessage_allTab("", "sync_mark_point", {"path_name_base64":path_name_base64, "mark_point":mark_point})
		}
		
		else if(todo=="delete_mark_point"){
			var path_name_base64=extra.path_name_base64
			
			storage_get("mark_points", (c)=>{
				var mark_points=c.mark_points || {}
				
			    delete mark_points[path_name_base64]
			    storage_set({"mark_points":mark_points})
			})
			changeBadgeText(0)
		}
		
		/* else if(todo=="update_black_hosts"){
			storage_set({"black_hosts": extra.black_hosts})
		} */
		
		else if(todo=="update_article_style"){
			//article_style=extra.article_style
			storage_set({"article_style":article_style})
		}
		
		else if(todo=="changeBadgeText"){
			var sender_tab=sender.tab
			if(sender_tab.active){
				changeBadgeText(extra.num)
			}
		}
		
		else if(todo=="set_is_display_points_num"){
			if(extra.status){
				chrome.tabs.query({active:true, currentWindow: true},function (tabs){
				    get_mark_point(tabs[0].id, (data)=>{
				    	var mark_point=data[0]
				    	var is_reading_model=data[1]
				    	
				    	changeBadgeText(mark_point[is_reading_model?"points_reading_model":"points_normal"].length)
				    })
				})
			}
			else{
				chrome.action.setBadgeText({text:""})
			}
		}
		
		else if(todo=="sync_content_script_data"){
			chrome.tabs.query({currentWindow: true},function(tabs){
				tabs.forEach((tab)=>{
					//if(tab.id !== sender.tab.id){
					    send_to_tab(tab.id, "update_content_script_data")
					//}
				})
			})
		}
		
		else if(todo=="open_reading_model"){
			chrome.tabs.query({active:true, currentWindow: true},function (tabs){
			    open_reading_mode("popup", tabs[0].id)
			})
		}
		
		/* else if(todo=="get_reading_model_data"){
			var path_name_base64=extra.path_name_base64
			var mark_point={points_normal:[], points_reading_model:[]}
			
			get_articles((articles)=>{
			    storage_get("mark_points", (c)=>{
			    	var mark_points=c.mark_points || {}
			    	
			        if(typeof mark_points[path_name_base64] !== "undefined"){
			            mark_point=mark_points[path_name_base64]
			        }
			        
			        sendResponse([articles[path_name_base64], mark_point])
					
			        changeBadgeText(mark_point.points_reading_model.length)
			    })
			})
		} */
		
		else if(todo=="set_collect"){
			var path_name_base64 = extra.path_name_base64
			var is_collected     = extra.is_collected
			
			get_articles((articles)=>{
			    articles[path_name_base64].is_collected=is_collected
			    storage_set({"articles":articles})
			})
		}
		
		/* else if(todo=="get_db_data"){
			//大体量数据瘦身处理
			var articles_callback={}
			
			get_articles((articles)=>{
			    for(var key in articles){
			    	articles_callback[key]={}
			    	
			    	for(var key_in in articles[key]){
			    		if(key_in !== "main_content"){
			    		    articles_callback[key][key_in]=articles[key][key_in]
			    		}
			    	}
			    }
			    
			    storage_get(["mark_points", "black_hosts", "article_style"], (c)=>{
			    	var mark_points=c.mark_points || {}
			    	var black_hosts=c.black_hosts || []
			    	var article_style=c.article_style || {}
			    	
			        sendResponse({"mark_points":mark_points, "black_hosts":black_hosts, "articles":articles_callback, "article_style":article_style})
			    })
			})
		} */
		
		else if(todo=="close_tab"){
			chrome.tabs.remove(extra.id_need_close, ()=>{
				if(extra.id_active_tab){
				    chrome.tabs.update(extra.id_active_tab, {
				    	active:true
				    })
				}
			})
		}
		
		//本地获取文章正文
		else if(todo=="keep_el"){
			storage_set({
				article_html: extra.el_html
			})
			
			chrome.tabs.create({
				url: "../pages/show_article_el.html"
			})
		}
		else if(todo=="get_el"){
			//alert("get_el")
			storage_get("article_html", (c)=>{
				sendResponse({"html": c.article_html})
			})
		}
    })
	
	//ready_data()
	
	/* function ready_data(){
		chrome.storage.local.get(null, function(c){
			if(typeof c.mark_points !== "undefined"){
				if(!is_run_ready_data){
					is_run_ready_data=true
					
			        mark_points   = c.mark_points
					black_hosts   = c.black_hosts
					articles      = c.articles
					article_style = c.article_style
					
					for(var k in articles){
			        	if(!articles[k].is_collected){
			                if(Date.now()-articles[k].time_add >= 30*24*60*60*1000){
			        			if(typeof mark_points[k] == "undefined"){
			                	    delete articles[k]
			        			}
			        			else{
			        				if(mark_points[k].points_reading_model.length==0){
			        					delete articles[k]
			        				}
			        			}
			                }
			        	}
			        }
			        
			        storage_set({"articles":articles})
			        changeBadgeText(0)
				}
			}
		})
	} */
	
	function get_articles(callback){
		chrome.storage.local.get(["mark_points", "articles"], function(c){
			var articles = c.articles || {}
			
			if(typeof c.mark_points !== "undefined"){
			    var mark_points   = c.mark_points
				
				for(var k in articles){
			    	if(!articles[k].is_collected){
			            if(Date.now()-articles[k].time_add >= 30*24*60*60*1000){
			    			if(typeof mark_points[k] == "undefined"){
			            	    delete articles[k]
			    			}
			    			else{
			    				if(mark_points[k].points_reading_model.length==0){
			    					delete articles[k]
			    				}
			    			}
			            }
			    	}
			    }
			    
			    storage_set({"articles": articles})
			    //changeBadgeText(0)
			}
			
			if(typeof callback === "function"){
				callback(articles)
			}
		})
	}
	
	function deal_onActivated(target_tab_id){
		chrome.tabs.get(target_tab_id, function(tab){
			if(tab.status=="complete"){
			    if(/^https?:\/\//.test(tab.url) || (/^chrome-extension:\/\//.test(tab.url) && tab.url.indexOf("chrome-extension://"+chrome.runtime.id) !== -1)){
					get_mark_point(target_tab_id, (data)=>{
						var mark_point=data[0]
						var is_reading_model=data[1]
						
						changeBadgeText(mark_point[is_reading_model?"points_reading_model":"points_normal"].length)
					})
			    }
			    else{
			    	changeBadgeText(0)
			    }
			}
			else{
				changeBadgeText(0)
			}
			
			storage_set({
				t_deal_onActivated: null
			})
		})
	}
	
	function get_mark_point(tab_id, callback){
		send_to_tab(tab_id, "get_path_name", "", function(message_c){
			var mark_point={points_normal:[], points_reading_model:[]}
			var is_reading_model=null
			
			storage_get("mark_points", (c)=>{
				var mark_points=c.mark_points || {}
				
		    	if(message_c){
		            if(typeof mark_points[message_c.path_name_base64] !== "undefined"){
		                mark_point=mark_points[message_c.path_name_base64]
		            }
		    		is_reading_model=message_c.is_reading_model
		    	}
		    	
		    	callback([mark_point, is_reading_model])
		    })
		})
	}
	
	function write_to_desc(){
		send_to_tab("", "write_to_desc", "")
	}
	
	function open_reading_mode_by_contextmenu(info, tab){
		open_reading_mode("contextmenu", tab.id)
	}
	
	function open_reading_mode(way, tab_id){
		send_to_tab("", "get_article_url", "", function(data_obj){
			if(data_obj){
			    var url=data_obj.url
			    var path_name_base64=data_obj.path_name_base64
				var path_name_base64_arr_is_getting_rm_data=[]
			    
				get_articles((articles)=>{
			        if(typeof articles[path_name_base64] == "undefined"){
				    	if(path_name_base64_arr_is_getting_rm_data.indexOf(path_name_base64) == -1){
				    		/* path_name_base64_arr_is_getting_rm_data.push(path_name_base64)
				    		
			        	    if(way=="contextmenu"){
			        	        notify(language('wait_for_get_article_data'), 2000)
			        	    }
				    	    
				    	    var nonceStr=String(Date.now())
		                    var more=md5("scrollbar_tool"+nonceStr+"Verification")
		                    var formData=new FormData;
		                        formData.append("todo", "get_main_content")
		                        formData.append("app_name", "scrollbar_tool")
		                        formData.append("nonceStr", nonceStr)
		                        formData.append("more", more)
		                        formData.append("article_url", url)
		                        formData.append("article_url_encode", encodeURIComponent(url))
		                        formData.append("path_name_base64", path_name_base64)
				    	    	
		                    ajax("http://aa-zz.cn/get_article_data/server.php", "POST", formData, function(c){
		                    	if(c){
				    	    		//console.log(c)
			        	    		if(c.status=="success"){
				    	    			var article=c.article
				    	    			articles[path_name_base64]={"title":article.title, "url":url, "date":article.publishTimestamp, "main_content":article.content, "is_collected":false, "time_add":Date.now()}
				    	    			
			        	    			storage_set({"articles":articles})
			        	    			show_reading_mode(way, tab_id, true, path_name_base64)
				    	    		}
				    	    		else{
			        	    			show_reading_mode(way, tab_id, false, path_name_base64)
			        	    			notify(language('fail_get_article_data'))
			        	    		}
				    				
				    				var idx=path_name_base64_arr_is_getting_rm_data.indexOf(path_name_base64)
				    				path_name_base64_arr_is_getting_rm_data.splice(idx, 1)
				    	    	}
		                    }) */
				    		
				    		show_reading_mode(way, tab_id, false, path_name_base64)
			        	    notify(language('fail_get_article_data'))
				    	}
			        }
			        else{
			        	show_reading_mode(way, tab_id, true, path_name_base64)
			        }
				})
			}
			else{
				notify(language('not_support_read_model'))
			}
		})
	}
	
	function show_reading_mode(way, tab_id, is_success, path_name_base64){
		chrome.storage.local.get("article_style", function(c){
			var theme=c.article_style.is_dark?"dark":"light"
			
		    if(way=="popup"){
		    	send_message("callback_rm_data", {"status":is_success, "theme":theme})
		    }
			
		    //iframe 方式：
		    send_to_tab(tab_id, "open_reading_mode", {"status":is_success, "theme":theme})
			
			//新标签打开：
		    /* chrome.tabs.query({currentWindow:true, active:true},function(tabs){
		        chrome.tabs.create({url:"pages/reading_model.html"+"#"+path_name_base64+"_0_0_"+theme, index:tabs[0].index})
		    }) */
		})
	}
	
	function storage_set(object, callback){
		chrome.storage.local.set(object, function(c){
		    if(typeof callback == "function"){
				callback("finish")
			}
        })
	}
	
	function storage_get(keys, callback){
		chrome.storage.local.get(keys, function(c){
            if(typeof callback === "function"){
				callback(c)
			}
        })
	}
	
	function storage_remove(keys){
		chrome.storage.local.remove(keys)
	}
	
	function changeBadgeText(num){
		chrome.storage.local.get("setting_data", function(c){
			var is_display_points_num=true
			
		    if(typeof c.setting_data !== "undefined"){
		    	is_display_points_num=c.setting_data.is_display_points_num
		    }
			
			if(is_display_points_num){
				var num_mark_point=String(num)
		        if(num_mark_point > 0){
		            chrome.action.setBadgeText({text:num_mark_point})
		        }
		        else{
		        	chrome.action.setBadgeText({text:""})
		        }
		        chrome.action.setBadgeBackgroundColor({color:"#666"})
			}
		})
	}
	
	function new_install(db_keys){
		if(typeof db_keys !== "undefined"){
			get_browser((browser)=>{
				var app_name=""
		        if(db_keys.indexOf("is_init") == -1){
		        	app_name="scrollbar_tool_new_"+browser
		        }
		        else{
			    	var app_version=chrome.runtime.getManifest().version
		        	app_name="scrollbar_tool_keep_"+(app_version.replace(/\./g, "_"))+"_"+browser
		        }
		        
		        var nonceStr=String(Date.now())
		        var more=md5(app_name+nonceStr+"Verification")
		        var formData=new FormData;
		            formData.append("todo", "new_install")
		            formData.append("app_name", app_name)
		            formData.append("nonceStr", nonceStr)
		            formData.append("more", more)
		        ajax("https://aa-zz.cn/apps/user_tongji.php", "POST", formData, function(c){
		        	//console.log(c)
		        })
			})
		}
	}
	
	function get_browser(callback){
		var userAgent=navigator.userAgent
		var browser="chrome"
		if(/Edg/.test(userAgent)){
			browser="edge"
		}
		else{
			browser="chrome"
		}
		
		callback(browser)
	}
	
	function ajax(url, method, formData, callback){
		fetch(url, {
            method: method,
            body: formData
        })
        .then((response) => response.json())
        .then((data) => {
			if(typeof callback === "function"){
				callback(data)
			}
		})
		
		
    	/* var xhr = new XMLHttpRequest()
        xhr.open(method, url, true)
        xhr.onreadystatechange=function(response){
            if(xhr.readyState ==4){
    			if(xhr.status==200){
    		        if(callback){
    			    	var responseText=xhr.responseText
    			    	if(responseText){
    			            var json=JSON.parse(responseText)
    			    	    callback(json)
    			    	}
    			    	else{
    			    		callback(null)
    			    	}
    			    }
    			}
    			else{
    		    	if(callback){
    		    		callback(null)
    		    	}
    		    }
    		}
    	}
	
	    if(formData){
	        xhr.send(formData)
	    }
	    else{
	    	xhr.send()
	    } */
    }
	
	function language(name){
		return chrome.i18n.getMessage(name)
	}
	
	function send_to_tab(tab_id, todo, extra, callback){
		if(tab_id == ""){
		    chrome.tabs.query({active:true, currentWindow: true},function (tabs){
				tab_id=tabs[0].id
				if(callback){
		            do_send_to_tab_callback(tab_id, todo, extra, function(response){
						callback(response)
					})
				}
				else{
					do_send_to_tab(tab_id, todo, extra)
				}
	        })
		}
		else{
			if(callback){
		        do_send_to_tab_callback(tab_id, todo, extra, function(response){
					callback(response)
				})
			}
			else{
				do_send_to_tab(tab_id, todo, extra)
			}
		}
	}
	
	function do_send_to_tab(tab_id, todo, extra){
		chrome.tabs.sendMessage(tab_id, {todo: todo, extra:extra?extra:""})
	}
	
	function do_send_to_tab_callback(tab_id, todo, extra, callback){
		chrome.tabs.sendMessage(tab_id, {todo: todo, extra:extra?extra:""}, function(response){
            if(callback){
			    callback(response)
			}
	    })
	}
	
	function sendMessage_allTab(id_from_tab, todo, extra){
	    chrome.tabs.query({currentWindow: true},function (tabs){
		    for(var i=0,l=tabs.length;i<l;i++){
				var tab=tabs[i]
				if(tab.id !== id_from_tab){
				    if(/^https?:\/\//.test(tab.url) || (/^chrome-extension:\/\//.test(tab.url) && tab.url.indexOf("chrome-extension://"+chrome.runtime.id) !== -1)){
                        chrome.tabs.sendMessage(tab.id, {todo: todo, extra:extra?extra:""})
				    }
				}
		    }
		})
    }
	
	function send_message(todo, extra){
		chrome.runtime.sendMessage({todo: todo, extra:(extra!==""?extra:"")})
	}
	
	function notify(title, keep_time){
    	chrome.notifications.create({
    		type    : "basic",
    		iconUrl : "../img/smile.png",
    		title   : title,
    	    message : "\n"+language('appName')
    	}, function(id){
			var notificationId=id
			
			setTimeout(function(){
				try{
					chrome.notifications.clear(notificationId)
				}
				catch(error){
					console.log(error)
				}
			}, typeof keep_time !== "undefined" ? keep_time : 5000)
		})
		
		chrome.notifications.onClicked.addListener(function(notificationId){
			chrome.notifications.clear(notificationId)
		})
    }