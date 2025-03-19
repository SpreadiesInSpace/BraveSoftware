	var is_pc        = !/mobile/i.test(navigator.userAgent)
	var is_zh_cn     = chrome.i18n.getUILanguage()=="zh-CN"
	var body_el      = document.body
	var wrap         = document.querySelector("#wrap")
	var screen_width = window.screen.width
	var screen_height= window.screen.height
	var body_width   = is_pc?Math.min(parseInt(screen_width/4-20), parseInt(screen_width/4)):screen_width
    var body_height  = is_pc?Math.min(parseInt(body_width*1.8), parseInt(screen_height*0.8)):screen_height
	
	var more_app_lists    = [
	    {"name":{"zh_cn":"卡片书签", "en":"Card Bookmarks"}, "icon":"../img/more_apps/card_bookmark.png", "is_installed":false, "desc_simple":{"zh_cn":"以新的方式（弹窗）呈现书签", "en":"Presenting a bookmark in a new way"}, "desc":{"zh_cn":"不占用网页显示空间，简约设计，随时可用，用完即走", "en":"It does not occupy the display space of the webpage, is simple in design, and can be used at any time."}, "url_chrome":"https://chrome.google.com/webstore/detail/card-bookmarks/dkeildaicdhjaboibehldcancpkafnfl", "url_edge":"https://microsoftedge.microsoft.com/addons/detail/pohdfciklomffdjobmihohbdfdpkecli"},
		/* {"name":{"zh_cn":"So Tab 新搜索", "en":"So Tab"}, "icon":"../img/more_apps/so_tab.png", "is_installed":false, "desc_simple":{"zh_cn":"多引擎快速搜索", "en":"Multi-engine fast search"}, "desc":{"zh_cn":"快速发起搜索，多个引擎自由切换，网页文字和图片可透视——在其他标签查看、编辑，快速将网页图片设为新标签背景", "en":"Quickly launch search, and multiple engines can switch freely."}, "url_chrome":"https://chrome.google.com/webstore/detail/kkfdbokcmmeepkfloclnkabfijpfebdd", "url_edge":"https://microsoftedge.microsoft.com/addons/detail/ihjnciigmjhibenkchdfdbcnadfipboe"}, */
		{"name":{"zh_cn":"Copy X 收藏集", "en":"Copy X"}, "icon":"../img/more_apps/copy_x.png", "is_installed":false, "desc_simple":{"zh_cn":"复制即收藏，有文字有链接，随时可搜索溯源", "en":"Copy is collection, with words and links, which can be searched and traced at any time."}, "desc":{"zh_cn":"在网页上复制文字时，自动保存内容及所在网页的标题和网址，方便后续搜索和查看。通过右键菜单获取图片链接时，自动保存图片链接并显示图片。轻松生成简约美观的收藏集", "en":"When copying text on a web page, automatically save the content and the title and web address of the web page, which is convenient for subsequent search and viewing. When you get a picture link through the right-click menu, automatically save the picture link and display the picture. Easily generate simple and beautiful collections."}, "url_chrome":"https://chrome.google.com/webstore/detail/copy-x/pljacoeopccbcpnkgpbjmcckfehjjpbb", "url_edge":"https://microsoftedge.microsoft.com/addons/detail/copy-x/lngaifjohmlfigcnelbldnaoipdakeok"},
		{"name":{"zh_cn":"隐形滚动条", "en":"Invisible scrollbar"}, "icon":"../img/more_apps/invisible_scrollbar.png", "is_installed":true, "desc_simple":{"zh_cn":"更现代的滚动条", "en":"More modern scroll bars"}, "desc":{"zh_cn":"重新实现滚动条，悬浮显示、可隐形，双击网页可标记浏览位置", "en":"Re-implement the scroll bar, floating display, invisible, double-click the web page to mark the browsing position"}, "url_chrome":"https://chrome.google.com/webstore/detail/invisible-scroll-bar/nphnhlhdlbonnekhjlmphinfnmekiifk", "url_edge":"https://microsoftedge.microsoft.com/addons/detail/jmopomhdbfldgbfmmkldkkeahhpbldal"}
	]
	
	body_el.style.setProperty("--body_width", body_width+"px")
	body_el.style.setProperty("--body_height", body_height+"px")
	
	window.onload=function(){
		setTimeout(()=>{
	        console.log(window.innerWidth)
		    body_width =window.innerWidth
		    body_height=window.innerHeight
		    body_el.style.setProperty("--body_width", body_width+"px")
		    body_el.style.setProperty("--body_height", body_height+"px")
		}, 0)
	}
	
	var main=new Vue({
		el:"#main",
		data:{
			is_pc:is_pc,
			is_zh_cn:is_zh_cn,
			path_name_base64:"",
			target_page_url :"",
			target_page_host:"",
			icon_text_size:50,
			rotate:0,
			t_chang_icon:null,
			is_got_permission:true,
			is_reading_model:false,
			is_getting_rm_data:false,
			rm_theme:"",
			is_normal_tab:true,
			display_scrollbar_type:true,
			display_points:false,
			display_pages:false,
			display_articles:false,
			display_tabs:false,
			display_usage:false,
			display_setting:false,
			
			top_progress:{
				display_style_items:false,
			    display_change_opacity:false,
			},
			scroll_bar:{
				display_style_items:false,
			    display_change_opacity:false,
				display_change_vein:false,
			},
			display_more_app:false,
			black_hosts:[],
			pages_mark_all:[],
			pages_mark:[],
			articles:{},
			articles_collected_all:[],
			articles_collected:[],
			tabs:[],
			id_active_tab:null,
			setting_data:{ //定义 key，value 会被实际值覆盖
				top_progress_color: "blue",
				scroll_bar_color: "rgba(74, 73, 73, 0.6)",
				scroll_bar_value: "yes",
				is_top_progress_auto_hide: false,
				is_need_scrollbar: true,
				is_fixed_scroll_bar: true,
				is_use_side_click: true,
				is_use_mark_point: true,
				is_display_points_num: true,
				is_reading_mode_auto_full_screen: false
			},
			more_app_lists:more_app_lists,
			mark_point:{"points_normal":[], "points_reading_model":[]},
			prev_point:null,
			prev_right_click_item:null
		},
		computed:{
			is_hide_native_scrollbar:function(){
				return (this.is_normal_tab ? this.black_hosts.indexOf(this.target_page_host) === -1 : false)
			}
		},
		methods:{
			//点击顶部 R 图标开启阅读模式
			open_reading_model:function(){
				var path_name_base64=this.path_name_base64
				if(this.is_normal_tab && !this.is_reading_model){
					if(typeof this.articles[path_name_base64] == "undefined"){
						if(!this.is_getting_rm_data){
							this.is_getting_rm_data=true
							
						    send_message("open_reading_model", "")
						    
					        if(this.t_chang_icon){
					        	clearInterval(this.t_chang_icon)
					        	this.t_chang_icon=null
					        }
					        this.t_chang_icon=setInterval(()=>{
					        	this.rotate+=3
					        	if(this.rotate%360==0){
					        		if(this.is_reading_model){
					        			clearInterval(this.t_chang_icon)
			                            this.t_chang_icon=null
					        		}
					        	}
					        }, 5)
					        
					        //字号平滑变大变小
					        /* var that=this
					        var t=setInterval(fun, 300)
					        
					        function fun(){
					        	if(that.icon_text_size>12){
					        		that.icon_text_size-=1
					        	}
					        	else{
					        		clearInterval(t)
					        		t=setInterval(()=>{
					        			if(that.icon_text_size<50){
					        	        	that.icon_text_size+=1
					        	        }
					        			else{
					        				clearInterval(t)
					        				t=setInterval(()=>{
					                        	fun()
					                        }, 300)
					        			}
					        		}, 300)
					        	}
					        } */
						}
					}
					else{
						show_reading_mode()
					}
				}
				else{
					if(!this.is_reading_model){
					    toast.show(this.language("not_support_reading_model"))
					}
					else{
						toast.show(this.language("is_reading_model"))
					}
				}
			},
			switch_status:function(){
				var idx=this.black_hosts.indexOf(this.target_page_host)
				
				if(this.is_normal_tab){
				    if(idx == -1){
				    	this.black_hosts.push(this.target_page_host)
				    }
				    else{
				    	this.black_hosts.splice(idx)
				    }
				    
					storage_set({"black_hosts": this.black_hosts}, ()=>{
						send_to_all_tab("update_content_script_data", "")
					})
				}
			},
			get_permission:function(){
				chrome.permissions.request({
                    permissions: ['tabs'],
                }, function(granted){
                    if(granted){
						
					}
					else{
						
					}
				})
			},
			to_display_content:function(data){
				if(data == "scrollbar_type"){
					this.display_scrollbar_type = !this.display_scrollbar_type
				}
				else if(data == "points"){
					if(this.mark_point[this.is_reading_model?'points_reading_model':'points_normal'].length>0){
					    this.display_points = !this.display_points
					}
					else{
						toast.show(this.language(this.path_name_base64?"no_point":"not_support_mark"))
					}
				}
				else if(data == "pages"){
					if(this.pages_mark_all.length>0){
					    this.display_pages = !this.display_pages
					}
					else{
						toast.show(this.language("no_page"))
					}
				}
				else if(data == "articles"){
					if(this.articles_collected_all.length>0){
					    this.display_articles = !this.display_articles
					}
					else{
						toast.show(this.language("no_article"))
					}
				}
				else if(data == "tabs"){
					this.display_tabs = !this.display_tabs
				    
				}
				else if(data == "usage"){
					this.display_usage = !this.display_usage
				    if(this.display_usage){
						if(this.is_hide_native_scrollbar){
				    	    send_to_tab("", "show_usage_color_block", "")
						}
				    }
				}
				else if(data == "setting"){
					this.display_setting = !this.display_setting
					if(this.display_setting){
					    /* this.display_style_items = false
					    this.display_change_opacity   = false */
					}
				}
				else if(data == "more_app"){
					this.display_more_app = !this.display_more_app
				}
			},
			to_point:function(list){
				if(!list.is_show_del){
					if(this.prev_point !== null){
						this.prev_point.is_selected=false
					}
					list.is_selected=true
					this.prev_point=list
					
				    send_to_tab("", "to_point", {"point":list})
				}
			},
			view_marked_page:function(list){
				if(list){
				    if(list.points_normal.length>0){
				    	this.open_page(list.url)
				    }
				    else{
				    	this.view_article(list.path_name_base64)
				    }
				}
			},
			view_article:function(path_name_base64){
				if(path_name_base64){
				    this.open_page("pages/reading_model.html"+"#"+path_name_base64+"_0_0_"+main.rm_theme)
				}
			},
			switch_tab:function(id){
				this.id_active_tab=id
				chrome.tabs.update(id, {
					active:true
				})
			},
			close_tab:function(id){
				//chrome.tabs.remove(id)
				send_to_tab(id, "close_tab", "", (c)=>{
					if(!c){
						send_message("close_tab", {"id_need_close":id, "id_active_tab":id !== main.id_active_tab?main.id_active_tab:null})
					}
				})
			},
			open_page:function(url){
				if(url){
				    chrome.tabs.create({url:url})
				}
			},
			right_click:function(item){
				if(this.prev_right_click_item !== null && this.prev_right_click_item !== item){
					this.prev_right_click_item.is_show_del=false
				}
				
				item.is_confirm_del=false
				item.is_show_del = !item.is_show_del
				this.prev_right_click_item=item
			},
			delete_point:function(idx){
				var points=this.is_reading_model?this.mark_point.points_reading_model:this.mark_point.points_normal
				if(!points[idx].is_confirm_del){
					points[idx].is_confirm_del=true
				}
				else{
				    points.splice(idx, 1)
					this.prev_right_click_item=null
					
					var path_name_base64 =this.path_name_base64
					var points_normal_new=[]
					var points_reading_model_new=[]
					
					this.mark_point.points_normal.forEach(function(item){
						var obj={}
						    obj.value=item.value
						    obj.desc =item.desc
						points_normal_new.push(obj)
					})
					this.mark_point.points_reading_model.forEach(function(item){
						var obj={}
						    obj.value=item.value
						    obj.desc =item.desc
						points_reading_model_new.push(obj)
					})
					
					var points_new=this.is_reading_model?points_reading_model_new:points_normal_new
					if(points_new.length==0){
						this.display_points = false
					}
					
					if(points_normal_new.length==0 && points_reading_model_new.length==0){
						var idx_target_page=0
						this.pages_mark_all.forEach((page, idx)=>{
							if(page.path_name_base64==this.path_name_base64){
								idx_target_page=idx
							}
						})
						
						this.pages_mark_all.splice(idx_target_page, 1)
						if(idx_target_page<this.pages_mark.length){
							this.pages_mark.splice(idx_target_page, 1)
						}
					}
					
					var mark_point_db={}
					    mark_point_db.title =this.mark_point.title
					    mark_point_db.url   =this.mark_point.url
					    mark_point_db.time  =Date.now()
						mark_point_db.points_normal=points_normal_new
					    mark_point_db.points_reading_model=points_reading_model_new
					
					send_message("set_mark_point", {"path_name_base64":path_name_base64, "mark_point":mark_point_db, "is_reading_model":this.is_reading_model})
				}
			},
			delete_page_marked:function(idx){
				var item=this.pages_mark[idx]
				if(!item.is_confirm_del){
					item.is_confirm_del=true
				}
				else{
				    this.pages_mark.splice(idx, 1)
				    this.pages_mark_all.splice(idx, 1)
					
					if(this.pages_mark_all.length==0){
						this.display_pages = false
					}
					
					if(this.path_name_base64 == item.path_name_base64){
						this.display_points=false
						this.mark_point={points_normal:[], points_reading_model:[]}
					}
					
					send_message("delete_mark_point", {"path_name_base64":item.path_name_base64})
				}
			},
			delete_article_collected:function(idx){
				var item=this.articles_collected[idx]
				if(!item.is_confirm_del){
					item.is_confirm_del=true
				}
				else{
					this.articles_collected.splice(idx, 1)
				    this.articles_collected_all.splice(idx, 1)
					
					if(this.articles_collected_all.length==0){
						this.display_articles = false
					}
					
					send_message("set_collect", {"path_name_base64":item.path_name_base64, is_collected:false})
				}
			},
			show_more:function(type){
				var data_show=this[type]
		            data_show=data_show.concat(this[type+"_all"].slice(data_show.length, data_show.length+10))
		        this[type]=data_show
			},
			set_setting:function(item){
				var setting_data=this.setting_data
				
				this.setting_data[item] = !setting_data[item]
				storage_set({"setting_data": this.setting_data}, ()=>{
					send_to_all_tab("update_content_script_data", "")
				})
				
				if(item == "is_display_points_num"){
					var status=this.setting_data[item]
					send_message("set_is_display_points_num", {"status":status})
				}
			},
			set_color:function(type, color){ //设置带透明度的颜色
				if(type === "top_progress"){
					this.setting_data.top_progress_color=color
				}
				else{
					this.setting_data.scroll_bar_color=color
				}
				
				storage_set({"setting_data": this.setting_data}, ()=>{
					send_to_all_tab("update_content_script_data", "")
				})
			},
			to_hide_style_items:function(type){
				if(type === "top_progress"){
					this.top_progress = {
						display_style_items: false,
						display_change_opacity: false
					}
				}
				else{
					this.scroll_bar = {
						display_style_items: false,
						display_change_vein: false,
						display_change_opacity: false
					}
				}
			},
			to_display_style_items:function(type){
				this[type].display_style_items=true
			},
			change_top_progress_color:function(type){
				this[type].display_style_items=false
				this.get_rgb_color(this.setting_data[type === "top_progress"?"top_progress_color" : "scroll_bar_color"], (c)=>{
				    color_selecter_cover.show(type, c)
				})
			},
			to_display_change_opacity:function(type){
				this[type].display_style_items=false
				this[type].display_change_opacity=true
			},
			change_opacity:function(type, opacity){
				this.get_rgb_color(this.setting_data[type === "top_progress"?"top_progress_color" : "scroll_bar_color"], (c)=>{
					this.set_color(type, "rgba("+c.rgb+","+opacity+")")
				    this[type].display_change_opacity=false
				})
			},
			to_display_change_vein:function(type){
				this[type].display_style_items=false
				this[type].display_change_vein=true
			},
			change_vein:function(type, value){
				this.setting_data.scroll_bar_vein=value //no | yes
				
				storage_set({"setting_data": this.setting_data}, ()=>{
					send_to_all_tab("update_content_script_data", "")
				})
				this[type].display_change_vein=false
			},
			install:function(list){
				get_browser((browser)=>{
				    if(typeof list["url_"+browser] !== "undefined"){
				    	this.open_page(list["url_"+browser])
				    }
				    else{
				    	this.open_page(list["url"])
				    }
				})
			},
			repost_to_support:function(){
				//toast.show("感谢支持 😀")
				setTimeout(this.open_page, 0, 'https://weibo.com/1667387292/Ja0kPDKSj')
			},
			get_rgb_color:function(color, callback){
	        	if(/^#\w{6}/.test(color)){
	                var group   = /^#(\w{2})(\w{2})(\w{2})$/.exec(color)
	                var rgb_arr = []
					
	                for(var c=1;c<=3;c++){
	                    rgb_arr.push(parseInt(group[c], 16))
	                }
	        	    
	        	    if(callback){
	                    callback({"rgb":rgb_arr.join(","), "a":0})
	        	    }
	        	}
				else if(/^rgba/.test(color)){
					var group = /\((.+)\)/.exec(color)[1].split(",")
					var rgb   = group.slice(0, 3).join(",")
					var a     = group[3]
					
					if(callback){
	                    callback({"rgb":rgb, "a":a})
	        	    }
				}
				else {
					if(callback){
	                    callback({"rgb":"255,0,0", "a":0})
	        	    }
				}
	        },
			language:function(name){
	        	return chrome.i18n.getMessage(name)
	        }
		}
	})
	
	var color_selecter_cover=new Vue({
		el:"#color_selecter_cover",
		data:{
			type: "",
			display : false,
			is_show : false,
			color   : "blue",
			opacity : 1
		},
		compiled:function(){
			
		},
		methods:{
			show:function(type, {rgb, a}){
				console.log("show")
				
				this.type=type
				this.display=true
				this.is_show=true
				this.color="rgb("+rgb+")"
				this.opacity=a
			},
			cancel:function(){
				this.is_show=false
				setTimeout(()=>{
					this.display=false
				}, 300)
			},
			on_change_color:function(e){
				this.color=e.target.value
			},
			set_color:function(){
				if(/^#/.test(this.color)){
				    main.get_rgb_color(this.color, (c)=>{
				    	//main.set_color(this.type, "rgba("+c.rgb+","+this.opacity+")")
				    	main.set_color(this.type, "rgba("+c.rgb+","+1+")")
				    })
				}
				
				this.cancel()
			},
			language:function(name){
	        	return chrome.i18n.getMessage(name)
	        }
		}
	})
	
	var toast=new Vue({
		el:"#toast",
		data:{
			display  : false,
			is_show  : false,
			text_con : "",
			t1       : null,
			t2       : null,
		},
		methods:{
			show:function(text_con){
				var that=this
				this.text_con = text_con
				this.display  = true
				this.is_show  = true
				
				if(this.t1 !== null || this.t2 !== null){
					clearInterval(this.t1)
					clearInterval(this.t2)
					this.t1=null
					this.t2=null
				}
				this.t1=setTimeout(()=>{
			        that.is_show=false
			        that.t2=setTimeout(()=>{
			        	that.display=false
						that.t2=null
			        }, 281)
					that.t1=null
			    }, 2200)
			}
		}
	})
	
	//send_message_callback("get_db_data", "", function(c){
	get_articles((articles)=>{
		var articles_callback={}
		
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
	    	
	        //sendResponse({"mark_points":mark_points, "black_hosts":black_hosts, "articles":articles_callback, "article_style":article_style})
			
			main.black_hosts  = black_hosts
		    main.rm_theme     = article_style.is_dark?"dark":"light"
		    
		    send_to_tab("", "get_path_name", {"black_hosts":main.black_hosts}, function(webpage_info){
		    	if(webpage_info){
		    		init_data(mark_points, articles_callback, webpage_info)
		    	}
		    	else{
		    		//chrome.tabs.query({active:true, currentWindow: true}, function(tabs){
		    			//main.target_page_url = tabs[0].url
		    		    main.is_normal_tab   = false
		    		    deal_articles(articles_callback, mark_points)
		    		//})
		    	}
		    })
		    
		    chrome.permissions.contains({
                permissions: ['tabs'],
            }, function(result){
                if(result){
		    		main.is_got_permission=true
		    	}
		    	else{
		    		main.is_got_permission=false
		    	}
		    })
	    })
	})
	//})
    
	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
		//console.log(message)
		var todo=message.todo
		if(todo=="callback_rm_data"){
			if(message.extra.status){
			    main.is_reading_model=true
			    main.rm_theme=message.extra.theme
				
				if(main.setting_data.is_reading_mode_auto_full_screen){
					window.close()
				}
			}
			else{
				clearInterval(main.t_chang_icon)
			    main.t_chang_icon=null
			}
			
			main.is_getting_rm_data=false
		}
	})
	
	document.addEventListener("contextmenu", function(e){
		//console.log(e.target.tagName)
        if(e.target.tagName=="INPUT" || e.target.tagName=="TEXTAREA"){
			//console.log(e.target.getAttribute("readonly"))
			if(e.target.getAttribute("readonly")){
			    e.preventDefault()
			}
			else{
				//e.preventDefault()
			}
		}
		else{
		    e.preventDefault()
		}
    })
	
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
	
	function init_data(mark_points, articles, webpage_info){
	    var page_url          = webpage_info.page_url
	    var page_host         = webpage_info.page_host
	    var path_name_base64  = webpage_info.path_name_base64
	    var is_reading_model  = webpage_info.is_reading_model
	    var is_normal_tab     = webpage_info.is_normal_tab
		
		main.target_page_url  = page_url
		main.target_page_host = page_host
		main.path_name_base64 = path_name_base64
		main.is_reading_model = is_reading_model
		main.is_normal_tab    = is_normal_tab
		
	    if(typeof mark_points[path_name_base64] !== "undefined"){
			var mark_point={...mark_points[path_name_base64]}
			
	    	mark_point.points_normal.forEach(function(item){
	        	item.is_selected=false
	        	item.is_show_del=false
	        	item.is_confirm_del=false
	        })
			mark_point.points_reading_model.forEach(function(item){
	        	item.is_selected=false
	        	item.is_show_del=false
	        	item.is_confirm_del=false
	        })
			
			if(mark_point[is_reading_model?"points_reading_model":"points_normal"].length>0){
				main.display_points=true
				main.$nextTick(function(){
					setTimeout(deal_articles, 100, articles, mark_points)
				})
			}
			else{
				deal_articles(articles, mark_points)
			}
			
			main.mark_point   = mark_point //当前页面标记的节点
	    }
		else{
			deal_articles(articles, mark_points)
		}
	}
	
	function deal_articles(articles, mark_points){
		var articles_collected = []          //收藏的文章
		
		for(var k in articles){ //保存的正文文章
			if(articles[k].is_collected){
				articles[k].path_name_base64=k
				articles[k].is_show_del=false
				articles[k].is_confirm_del=false
				
				articles_collected.push(articles[k])
			}
		}
		articles_collected.sort(function(a, b){
			return b.time_add-a.time_add
		})
		
		main.articles               = articles
		main.articles_collected_all = articles_collected
		main.articles_collected     = articles_collected.slice(0, 10)
		
		if(!main.display_points && main.articles_collected.length>0){
			//main.display_articles = true
			//main.$nextTick(function(){
				deal_marked_pages(mark_points)
			//})
		}
		else{
			deal_marked_pages(mark_points)
		}
	}
	
	function deal_marked_pages(mark_points){
		var pages_mark_all = []     //标记不为空的页面
		
		for(var k in mark_points){
			if(mark_points[k].points_normal.length>0 || mark_points[k].points_reading_model.length>0){
				var obj=mark_points[k]
			        obj.path_name_base64=k
				    obj.is_show_del=false
				    obj.is_confirm_del=false
				pages_mark_all.push(obj)
			}
		}
		pages_mark_all.sort(function(a, b){
			return b.time-a.time
		})
		
		main.pages_mark_all = pages_mark_all
		main.pages_mark     = pages_mark_all.slice(0, 10)
		
		/* chrome.tabs.query({currentWindow: true}, function(tabs){
			tabs.forEach((tab)=>{
				if(tab.active){
				    main.id_active_tab=tab.id
				}
			})
			
			main.tabs=tabs
			main.$nextTick(()=>{
			    setTimeout(()=>{
			    	main.display_tabs=true
			    }, 100)
			})
		}) */
		
		ready_setting_data()
	}
	
	function ready_setting_data(){
		chrome.storage.local.get("setting_data", function(c){
			if(typeof c.setting_data !== "undefined"){
				if(typeof c.setting_data.is_need_scrollbar == "undefined"){
					c.setting_data.is_need_scrollbar=true
				}
				
				if(typeof c.setting_data.is_fixed_scroll_bar == "undefined"){
					c.setting_data.is_fixed_scroll_bar=false
				}
				
				if(typeof c.setting_data.is_use_side_click == "undefined"){
					c.setting_data.is_use_side_click=true
				}
				
				if(typeof c.setting_data.top_progress_color == "undefined"){
					c.setting_data.top_progress_color="blue"
				}
				
				if(typeof c.setting_data.is_top_progress_auto_hide == "undefined"){
		    		c.setting_data.is_top_progress_auto_hide=false
		    	}
				
				if(typeof c.setting_data.is_reading_mode_auto_full_screen == "undefined"){
					c.setting_data.is_reading_mode_auto_full_screen=false
				}
				
				main.setting_data=c.setting_data
				main.display_more_app=true
			}
		})
	}
	
	function show_reading_mode(){
		main.is_reading_model=true
		//iframe 方式：
		send_to_tab("", "open_reading_mode", {"status":true, "theme":main.rm_theme})
		
		//新标签打开：
		/* chrome.tabs.query({currentWindow:true, active:true},function(tabs){
		    chrome.tabs.create({url:"pages/reading_model.html"+"#"+main.path_name_base64+"_0_0_"+main.rm_theme, index:tabs[0].index})
		}) */
		
		if(!main.setting_data.is_reading_mode_auto_full_screen){
			main.display_points = main.mark_point.points_reading_model.length>0
		}
		else{
			window.close()
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
	
	// setBadgeText 在 popup 中不可用
	function changeBadgeText(num){
		if(main.is_display_points_num){
		    var num_mark_point=String(num)
		    if(num_mark_point !== "0"){
		        chrome.browserAction.setBadgeText({text:num_mark_point})
		    }
		    else{
		    	chrome.browserAction.setBadgeText({text:""})
		    }
		    chrome.browserAction.setBadgeBackgroundColor({color:"#666"})
		}
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
	
	function send_message(todo, extra){
		chrome.runtime.sendMessage({todo: todo, extra:(extra!==""?extra:"")})
	}
	
	function send_message_callback(todo, extra, callback){
		chrome.runtime.sendMessage({todo: todo, extra:(extra!==""?extra:"")}, function(response){
			if(callback){
                callback(response)
			}
		})
	}
	
	function send_to_all_tab(todo, extra){
	    chrome.tabs.query({currentWindow: true},function (tabs){
		    tabs.forEach((tab)=>{
				do_send_to_tab(tab.id, todo, extra)
			})
		})
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