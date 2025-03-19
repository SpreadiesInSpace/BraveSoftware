var data_arr_from      = location.hash.replace(/^#/, "").split("_")
var img_num_in_top     = data_arr_from[1]
var scroll_top_get     = data_arr_from[2]
var path_name_base64   = data_arr_from[0]

var is_in_iframe = window.self!==window.top

var num_img_need_load=0
var mark_point={}
var function_key_now= []
var point_idx=-1

var wrap=new Vue({
	el:"#wrap",
	data:{
		is_in_iframe        : is_in_iframe,
		is_notified_display : false,
		is_display_page     : true, /*status desc only*/
		display             : is_in_iframe?true:false,
		display_tool_bar    : true,
		is_show_tool_bar    : false,
		jindu_width         : 0,
		article_style       : {"width":"narrow", "is_dark":false},
		is_collected        : false,
		title               : "",
		web_url             : "",
		date                : "",
		content             : "",
		html                : "",
		imgs                : [],
        show_img_idx        : 0,
		win_height          : window.innerHeight,
        is_loading          : false,
	},
	computed:{
		web_origin:function(){
			if(this.web_url){
			    var a_tag=document.createElement("a")
			    a_tag.href=this.web_url
			    return a_tag.origin
			}
		}
	},
	methods:{
		qiege:function(obj){
			var text=obj.text
			var markups=obj.markups
			var markups_ok=[]
			var se_dealed=""
			
			for(var i=0, l=markups.length;i<l;i++){
				var item=markups[i]
				var s=item.start //包含
				var e=item.end   //不包含
				
				item.text=text.substring(s, e)
				if(item.tag=="a"){
					if(!/https?:\/\//.test(item.source)){
						if(/^\/.+/.test(item.source)){
							item.source=this.web_origin+item.source
						}
						else{
						    item.tag="normal"
						}
					}
				}
				
				if(i==0){
				    if(s>0){
						markups_ok.push({"tag":"normal", "text":text.substring(0, s)})
				    }
					
					//防止重复
					if(s+"_"+e !== se_dealed){
				        se_dealed=s+"_"+e
					    markups_ok.push(item)
					}
					else{
				    	markups_ok[markups_ok.length-1].tag+=" "+item.tag
				    }
				}
				else{
					if(s-markups[i-1].end>0){
						markups_ok.push({"tag":"normal", "text":text.substring(markups[i-1].end, s)})
					}
					
					//防止重复
					if(s+"_"+e !== se_dealed){
				        se_dealed=s+"_"+e
					    markups_ok.push(item)
					}
					else{
				    	markups_ok[markups_ok.length-1].tag+=" "+item.tag
				    }
				}
				
				if(i==l-1){
					if(e<=text.length-1){
						markups_ok.push({"tag":"normal", "text":text.substring(e, text.length)})
					}
				}
			}
			
			return markups_ok
		},
		fenduan:function(str){
			return str.split(/\n/)
		},
		get_media_url:function(source){
			return decodeURIComponent(/url=(.+)/.exec(source)[1])
		},
		to_display_tool_bar:function(is_show){
			this.is_show_tool_bar = is_show
		},
		close_win:function(){
			if(this.is_in_iframe){
				this.is_display_page=false
				
				this.display_tool_bar=false
				this.is_show_tool_bar=false
				
				setTimeout(()=>{
				    postMessage_to_main_window("close", "")
				}, 100)
			}
			else{
				window.close()
			}
        },
		open_tab:function(){
			var that=this
			chrome.tabs.query({currentWindow:true, active:true},function(tabs){
				var active_tab=tabs[0]
				var idx=active_tab.index
				if(that.is_in_iframe){
					var img_num_in_top=0
					wrap.$el.querySelector(".article_content").querySelectorAll("img").forEach((img, idx)=>{
						var rect=img.getBoundingClientRect()
						if(rect.top<0){
							img_num_in_top+=1
						}
						else{
							if(rect.top<window.innerHeight){
								img_num_in_top+=1
							}
						}
					})
					
			        chrome.tabs.create({url: location.href.replace(/_0_0_\w+$/, "_"+img_num_in_top+"_"+window.scrollY+"_"+(that.article_style.is_dark?"dark":"light")), index:idx})
				}
				else{
					chrome.tabs.create({url: that.web_url, index:idx+1})
				}
			})
        },
        set_collect:function(){
			this.is_collected = !this.is_collected
			send_message("set_collect", {"path_name_base64":path_name_base64, is_collected:this.is_collected})
		},
        set_width:function(is_need_set_all){
			get_first_dom_in_article((the_dom, offset)=>{
        	    //document.body.style.opacity=0.1
        	    var v=window.scrollY/document.body.scrollHeight
        	    if(this.article_style.width=="narrow"){
        	    	this.article_style.width="wide"
        	    }
        	    else{
        	    	this.article_style.width="narrow"
        	    }
			    
				this.$nextTick(()=>{
					send_message("update_article_style", {"article_style":this.article_style})
        	    	//window.scrollTo(0, document.body.scrollHeight*v)
					var rect=the_dom.getBoundingClientRect()
					var offset_ok = offset>=0?offset:offset*rect.height
			    	window.scrollTo(0, window.scrollY+rect.top-offset_ok)
					
			    	
        	    	/* setTimeout(()=>{
        	    	    document.body.style.opacity=1
			    		if(is_need_set_all){
			    			this.set_fullscreen(true)
			    		}
        	        }, 100) */
				})
			})
        },
        set_theme:function(){
			var is_dark=this.article_style.is_dark
        	this.article_style.is_dark = !is_dark
			send_message("update_article_style", {"article_style":this.article_style})
        	
			location.href=location.href.replace(/_\d+_\d+_\w+$/, "_0_0_"+(this.article_style.is_dark?"dark":"light"))
			do_set_theme(false)
        },
        set_fullscreen:function(is_need_set_all){
        	var scroll_y=window.scrollY
			if(this.is_in_iframe){
			    postMessage_to_main_window("fullscreen", "")
			}
			else{
				if(!document.webkitFullscreenElement){
        	    	document.documentElement.webkitRequestFullScreen()
        	    }
        	    else{
        	    	document.webkitCancelFullScreen()
        	    }
			}
			
        	setTimeout(()=>{
        		window.scrollTo(0, scroll_y)
				if(is_need_set_all){
					this.set_theme()
				}
        	}, 30)
        }
	}
})

document.documentElement.focus()

document.onclick=function(e){
	if(wrap.is_display_page){
	    chrome.storage.local.get("setting_data", function(c){
	    	var is_use_side_click=true
	    	if(typeof c.setting_data !== "undefined"){
	    		if(typeof c.setting_data.is_use_side_click == "undefined"){
	    			c.setting_data.is_use_side_click=true
	    		}
	    		
	    		is_use_side_click=c.setting_data.is_use_side_click
	    	}
	    	
	    	if(is_use_side_click){
	    		if(e.clientX==window.innerWidth-1){
	            	if(e.clientY>=window.innerHeight*0.3){
	            		$("html,body").animate({scrollTop:"0px"})
	            		//scroll_step(0)
	            	}
	            	else{
	            		$("html,body").animate({scrollTop:document.body.scrollHeight+"px"})
	            		//scroll_step(document.body.scrollHeight-wrap.win_height)
	            	}
	            }
	            
	            if(e.clientX==0){
	            	if(e.clientY !== 0){
	            		var scrollTop=window.scrollY
	            	    if(e.clientY>=wrap.win_height*0.5){
	            			window.scrollTo(0, scrollTop+wrap.win_height)
	            	    }
	            	    else{
	            			window.scrollTo(0, scrollTop-wrap.win_height)
	            	    }
	            	}
	            }
	    	}
	    })
	}
}

document.ondblclick=function(e){
	if(wrap.is_display_page){
	    if(e.clientX !== 0 && e.clientX !== window.innerWidth-1){
	    	if(!document.querySelector("#tool_bar").contains(e.target)){
	    		chrome.storage.local.get("setting_data", function(c){
	    			var is_use_mark_point=true
	    	    	if(typeof c.setting_data !== "undefined"){
	    	    		is_use_mark_point=c.setting_data.is_use_mark_point
	    	    	}
	    			
	    			if(is_use_mark_point){
	    				get_first_dom_in_scrollview(e.target, (the_dom)=>{
	    	            	if(the_dom){
		                	    get_desc(the_dom, 1)
							}
	    	            })
	    			}
	    	    })
	    	}
	    }
	}
}

document.onkeydown=function(e){
	if(function_key_now.indexOf(e.keyCode)==-1){
		function_key_now.push(e.keyCode)
	}
}

document.onkeyup=function(e){
	e.preventDefault()
	//if(!is_show_iframe_el){
	    if(function_key_now.length==1){  //确保只有一个键被按下
	        if(function_key_now[0]==17){ //Crtl
	    	    var points=mark_point.points_reading_model
				
	    	    if(typeof points !== "undefined" && points.length>0){
					if(point_idx<points.length-1){
	                    point_idx+=1
	                }
	                else{
	                	point_idx=0
	                }
					
					scroll_to_point(points[point_idx])
	    	    }
	    	}
	    	
	    	//拥有可扩展性
	    	/*if(function_key_now==39){ //right
	    		var scrollTop=document.body.scrollTop
	    		document.body.scrollTop=scrollTop+window.innerHeight
	    	}
	    	
	    	if(function_key_now==37){ //left
	    		var scrollTop=document.body.scrollTop
	    		document.body.scrollTop=scrollTop-window.innerHeight
	    	}
	    	*/
	    	function_key_now=[]
	    }
	    else{
	    	function_key_now=[]
	    }
	//}
}

window.onscroll=function(){
	var scroll_top=window.scrollY
	var scrollHeight=document.body.scrollHeight-window.innerHeight
	wrap.jindu_width=scroll_top/scrollHeight*100+"vw"
	
	if(wrap.imgs.length>0){
	    if(!wrap.is_loading){
	    	if(wrap.show_img_idx<wrap.imgs.length){
	            //show_img() //弃用原因：为了让新标签打开时滚动到相同位置
	    	}
	    }
	}
}

window.addEventListener("message", function(e){
	var msg_obj = e.data
	var todo    = msg_obj.todo
	
	if(todo=="is_display_page"){
		wrap.display_tool_bar=true
		wrap.is_display_page=true
	}
	else if(todo=="scroll_to_top"){
		if(wrap.is_display_page){
		    $("html,body").animate({scrollTop:"0px"})
		}
	}
	else if(todo=="scroll_to_bottom"){
		if(wrap.is_display_page){
		    $("html,body").animate({scrollTop:document.body.scrollHeight+"px"})
		}
	}
})

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
	var todo=message.todo
	if(todo=="get_path_name"){
		if(wrap.is_display_page){
		    var obj={}
		        obj.path_name_base64 = path_name_base64
		        obj.is_reading_model = true
		        obj.is_normal_tab    = wrap.is_in_iframe
		    sendResponse(obj)
		}
	}
	
	else if(todo=="set_collect"){
		var extra=message.extra
		if(path_name_base64 == extra.path_name_base64){
		    wrap.is_collected=extra.is_collected
		}
	}
	
	else if(todo=="sync_mark_point"){
		var extra=message.extra
		if(path_name_base64 == extra.path_name_base64){
		    mark_point=extra.mark_point
			console.log(mark_point)
		}
	}
	
	else if(todo=="write_to_desc"){
		if(wrap.is_display_page){
		    var the_desc=window.getSelection().toString()
			get_first_dom_in_scrollview(wrap.$el.querySelector(".article_content"), (the_dom)=>{
				mark(the_dom, the_desc)
			})
		}
	}
	
	else if(todo=="to_point"){
		if(wrap.is_display_page){
			scroll_to_point(message.extra.point)
		}
	}
})

chrome.storage.local.get("article_style", function(c){
	wrap.article_style=c.article_style
	
    //send_message_callback("get_reading_model_data", {"path_name_base64":path_name_base64}, function(data_arr){
	get_articles((articles)=>{
	    storage_get("mark_points", (c)=>{
	    	var mark_points=c.mark_points || {}
			
			mark_point={points_normal:[], points_reading_model:[]}
	        if(typeof mark_points[path_name_base64] !== "undefined"){
	            mark_point=mark_points[path_name_base64]
	        }
	        
    	    var article       =articles[path_name_base64]
    	    
    	    var main_content  = article.main_content
    	    wrap.title        = article.title
    	    wrap.web_url      = article.url
		    
    	    wrap.content      = main_content
    	    wrap.is_collected = article.is_collected
    	    
		    //window.main_content=main_content
    	    //console.log(main_content) //48
		    
		    //试图重新分段，但返回的数据不足以支持……
		    /* var paragraph_arr=[]
		    wrap.content.forEach((line, idx)=>{
		    	if(idx==0){
		    	    
		    	    paragraph.push(line)
		    	}
		    	
		    	if(line.type==0){
		    		var obj={}
		    		    obj.text = line.text.text
		    		
		    		if(Object.keys(line.text).length==1){
		    			obj.linetype="p"
		    		}
		    		else if(line.text.linetype){
		    			obj.linetype=line.text.linetype
		    			
		    			if(["h1", "h2", "h3", "aside"].indexOf(line.linetype) !== -1){
		    				var paragraph=[]
		    				paragraph.push(obj)
		    				paragraph_arr.push(paragraph)
		    			}
		    			else{
		    				paragraph_arr[paragraph_arr.length-1].push(obj)
		    			}
		    		}
		    		else if(line.text.markups){
		    			
		    		}
		    	}
		    }) */
		    
		    var border_width =wrap.article_style.is_dark?"0px":"11px"
		    var border_radius=wrap.article_style.is_dark?"11px":"0px"
		    img_idx=0
		    var html=""
		    for(var idx=0, l=wrap.content.length;idx<l;idx++){
		    	var arr=wrap.content
		    	var line=arr[idx]
		    	/* if(line.table){
		    	    console.log(JSON.stringify(line))
		    	} */
		    	
		    	if(line.type==0){
		    		if(line.text.markups && line.text.markups.length>0){
		    			html+='<p>'
		    			wrap.qiege(line.text).forEach((word)=>{
		    				var text=word.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")
		    				if(word.tag=="a"){
		    					html+='<a href="'+word.source+'" target="_blank">'+text+'</a>'
		    				}
		    				else if(word.tag=="img"){
		    					var img_height=word.height
		    					html+='<img src="'+(wrap.is_in_iframe?word.source:(img_num_in_top==0?word.source:img_idx<img_num_in_top?word.source:""))+'" data-src="'+word.source+'" data-width="'+word.width+'" data-height="'+img_height+'" class="inline_img" style="border-width:'+(img_height>100?border_width:"0px")+'; border-radius:'+(img_height>100?border-radius:"0px")+'; box-shadow:0 1px 8px rgba(0,0,0,'+(img_height>100?"0.3":"0")+')">'
		    					img_idx+=1
		    				}
		    				else{
		    					html+='<span class="'+word.tag+'">'+text+'</span>'
		    				}
		    			})
		    			html+='</p>'
		    		}
		    		else{
		    			var text=line.text.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")
		    			
		    			if(line.li){
		    				html+='<li class="li">'+text+'</li>'
		    			}
		    			else if(line.blockquote){
		    				html+='<div class="blockquote">'
		    				wrap.fenduan(text).forEach((line_in)=>{
		    					html+='<p>'+line_in+'</p>'
		    				})
		    				html+='</div>'
		    			}
		    			else if(line.text.linetype=='pre'){
		    				html+='<pre>'+text+'</pre>'
		    			}
		    			else if(Object.keys(line.text).length==1){
		    				html+='<p>'+text+'</p>'
		    			}
		    			else{
		    				html+='<p class="'+line.text.linetype+'">'+text+'</p>'
		    				
		    				/* var tag="p"
		    				if(idx>0){
		    					if(typeof arr[idx-1].text !== "undefined"){
		    					    if(arr[idx-1].text.linetype=='pre' || line.text.markups){
		    					    	tag="span"
		    					    }
		    						else{
		    					    	tag="p"
		    					    }
		    					}
		    					else{
		    						tag="p"
		    					}
		    				}
		    				html+='<'+tag+' class="'+(tag=="p"?(line.text.linetype?line.text.linetype:"p"):"pre")+'">'+text
		    				if(tag=="p"){
		    					if(idx<arr.length-1){
		    				        if(typeof arr[idx+1].text !== "undefined"){
		    				        	if(arr[idx+1].text.linetype=='pre' || line.text.markups){
		    				        		html+='<span class="pre">'+arr[idx+1].text.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")+'</span>'
		    				        		idx+=1
		    				        	}
		    					    	else{
		    				                html+='</'+tag+'>'
		    				            }
		    				        }
		    						else{
		    				            html+='</'+tag+'>'
		    				        }
		    					}
		    					else{
		    				        html+='</'+tag+'>'
		    				    }
		    				}
		    				else{
		    				    html+='</'+tag+'>'
		    				} */
		    			}
		    		}
		    	}
		    	else if(line.type==1){
		    		var img_height=line.image.height
		    		html+='<div><img src="'+(wrap.is_in_iframe?line.image.source:(img_num_in_top==0?line.image.source:img_idx<img_num_in_top?line.image.source:""))+'" alt="" data-src="'+line.image.source+'" data-width="'+line.image.width+'" data-height="'+img_height+'" style="border-width:'+(img_height>100?border_width:"0px")+'; border-radius:'+(img_height>100?border_radius:"0px")+'; box-shadow:0 1px 8px rgba(0,0,0,'+(img_height>100?"0.3":"0")+')"></div>'
		    		img_idx+=1
		    	}
		    	else if(line.type==2){
		    		html+='<iframe frameborder="0" scrolling="auto" width="100%" height="360" src="'+wrap.get_media_url(line.media.source)+'" alt=""></iframe>'
		    	}
		    	else if(line.type==11){
		    		html+='<div class="line"></div>'
		    	}
		    }
		    
		    setTimeout(()=>{ //避免在由默认的白底切换到可能的深色背景时立刻变换颜色
		        wrap.html=html
    	        wrap.$nextTick(()=>{
    	            /* wrap.imgs    = wrap.$el.querySelector(".article_content").querySelectorAll("img")
    	            if(wrap.imgs.length>0){
    	        	    show_img()
    	        	}
    	        	else{
    	        		display_iframe()
    	        	} */
		    		
		    		document.title=wrap.title
		        	do_set_theme(true)
		    		
		        	if(!wrap.is_in_iframe){
		        		if(img_num_in_top>0){
		        			deal_img_loading()
		        		}
		        		else{
		        			window.scrollTo(0, scroll_top_get)
		        	        location.href=location.href.replace(/_\d+_\d+_\w+$/, "_0_0_"+(wrap.article_style.is_dark?"dark":"light"))
		        			wrap.display=true
		        		}
		        	}
		        	else{
		        	    display_iframe()
		        	}
    	        })
    	    }, 300)
        })
    })
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

function deal_img_loading(){
	var imgs=wrap.$el.querySelector(".article_content").querySelectorAll("img")
	num_img_need_load=img_num_in_top
	
	imgs.forEach((img, idx)=>{
		if(img.src !== ""){
		    img.idx=idx
		    img.onload=function(){
				on_img_load(img, true)
			}
			img.onerror=function(){
				on_img_load(img, false)
			}
		}
	})
}

function on_img_load(img, is_can_load){
	//console.log(img.idx+" "+is_can_load)
	if(img.idx<img_num_in_top){
		num_img_need_load-=1
		if(num_img_need_load==0){
			if(window.scrollY==0){
            	window.scrollTo(0, scroll_top_get)
	        	location.href=location.href.replace(/_\d+_\d+_\w+$/, "_0_0_"+(wrap.article_style.is_dark?"dark":"light"))
				
				wrap.$el.querySelector(".article_content").querySelectorAll("img").forEach((img, idx)=>{
					if(idx>=img_num_in_top){
					    img.src=img.getAttribute("data-src")
					}
				})
				wrap.display=true
            }
		}
	}
}

//未使用
function show_img(){
	var target_img=wrap.imgs[wrap.show_img_idx]
	var top=target_img.getBoundingClientRect().top
	if(top < wrap.win_height*5){
		wrap.is_loading=true
		
		var img=new Image()
		img.src=target_img.getAttribute("data-url")
		img.onload=function(){
			show_and_next(img.src, 1)
		}
		img.onerror=function(){
			show_and_next(img.src, 0)
		}
	}
	else{
		display_iframe()
	}
}

function show_and_next(src, opacity){
	wrap.is_loading=false
	
	var target_img=wrap.imgs[wrap.show_img_idx]
	target_img.src=src
	console.log((wrap.show_img_idx+1)+"/"+wrap.imgs.length)
	target_img.ondblclick=function(){
		wrap.set_width(true)
	}
	
	wrap.show_img_idx+=1
	if(wrap.show_img_idx<wrap.imgs.length){
	    show_img()
	}
	else{
		console.log("图片已全部完成加载")
		display_iframe()
	}
}

function display_iframe(){
	if(wrap.is_in_iframe){
		if(!wrap.is_notified_display){
			wrap.is_notified_display=true
			wrap.display_tool_bar=true
		    postMessage_to_main_window("display_iframe", "")
			window.focus()
		}
	}
}

function do_set_theme(is_first_time){
	var html_el=document.querySelector("html")
	var is_dark=wrap.article_style.is_dark
	
    html_el.style.setProperty("--transition", is_first_time?(is_dark?"1000ms":"0ms"):"500ms")
    html_el.style.setProperty("--title_bg_color", is_dark?"rgb(40 44 52 / 0.2)":"#f6f6f6")
    html_el.style.setProperty("--text_color", is_dark?"#e4e4e4":"#222")
    html_el.style.setProperty("--link_color", is_dark?"#79d5ff":"#03A9F4")
    html_el.style.setProperty("--big_text_color", is_dark?"#fff":"#444")
    html_el.style.setProperty("--top_icon_bg_color", is_dark?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.5)')
    html_el.style.setProperty("--bg_color", is_dark?"#282c34":"#f6f6f6")
    html_el.style.setProperty("--article_bg_color", is_dark?"#2f5a90":"#fff") //#40557d
	
	html_el.querySelector(".article_content").querySelectorAll("img").forEach((img)=>{
		var img_height=img.getAttribute("data-height")
		var border_width =is_dark?"0px":"11px"
		var border_radius=is_dark?"11px":"0px"
		var box_shadow   =is_dark?"none":"0 1px 8px rgba(0,0,0,0.3)"
		img.style.borderWidth =img_height>100?border_width:"0px"
		img.style.borderRadius=img_height>100?border_radius:"0px"
		img.style.boxShadow   =img_height>100?box_shadow:"none"
	})
	
	if(wrap.is_in_iframe){
	    postMessage_to_main_window("set_bg_color", {"color":is_dark?"#282c34":"#f6f6f6"})
	}
}

//未使用
function scroll_step(y){
	var time_all  =300
	var time_cycle=4
	var scroll_top_now=window.scrollY
	var step=Math.ceil(Math.abs(scroll_top_now-y)/(time_all/time_cycle))
	
	var t=setInterval(()=>{
		if(scroll_top_now !== y){
		    if(scroll_top_now>y){
		    	scroll_top_now-=step
		    }
		    else{
		    	scroll_top_now+=step
		    }
			
			if(Math.abs(scroll_top_now-y)<step){
				scroll_top_now=y
			}
			
			window.scrollTo(0, scroll_top_now)
		}
		else{
			console.log("clear")
			clearInterval(t)
		}
	}, time_cycle)
}

function get_top_fixed_dom_height(callback){
	var body = document.body
	var all_dom = body.querySelectorAll("*")
	var clientWidth = body.clientWidth
	var fixed_doms = []
	var top_bar_h_arr = []
	var top_fixed_dom_height = 0
	
	for(var i=0;i<all_dom.length;i++){
        var the_dom=all_dom[i]
    	var style=getComputedStyle(the_dom)
    	var rect=the_dom.getBoundingClientRect()
	        	
	    if(style.position=="fixed"){
			fixed_doms.push(the_dom)
			
	        if(style.display !== "none" 
			&& rect.top==0 
	        && rect.width == clientWidth 
	        && rect.height > 0 
	        && rect.height < 100 
	        ){
	            top_bar_h_arr.push(rect.height)
	        }
	    }
    }
	
	if(top_bar_h_arr.length>=1){
	    top_bar_h_arr.sort(function(a, b){
			return b-a
		})
		top_fixed_dom_height=top_bar_h_arr[0]
	}
	
	if(callback){
	    callback(fixed_doms, top_fixed_dom_height)
	}
}

function get_first_dom_in_scrollview(target, callback){
	var body          = document.body
	var parent_dom    = target.parentNode?(target.parentNode.contains(body)?body:target.parentNode):body
	
	//理想的 parent_dom 应该是当前滚动的一级容器
	while(parent_dom.parentNode && parent_dom.parentNode !== body && !parent_dom.parentNode.contains(body)){
		parent_dom=parent_dom.parentNode
	}
	
	get_top_fixed_dom_height((fixed_doms, top_fixed_dom_height)=>{
	    var all_dom=parent_dom.querySelectorAll("*")
	    var is_continue=true
		var is_got_first_dom=false
		var the_first_dom=null
		
	    for(var i=0;i<all_dom.length;i++){
	    	if(is_continue){
	    	    var the_dom=all_dom[i]
	    	    var style  =getComputedStyle(the_dom)
	    	    var is_fixed_arr=[]
	    	    for(var k=0;k<=fixed_doms.length;k++){
	    	    	if(k==fixed_doms.length){
	    	    		if(is_fixed_arr.indexOf(true) == -1){
	    					//只在 reading_model.html 中可以等于 top_height
	    	    			if(the_dom.getBoundingClientRect().top > top_fixed_dom_height){
								if(!is_got_first_dom){
									is_got_first_dom=true
								    the_first_dom=the_dom
								}
								
								if(style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"){
	    	    				    is_continue=false
	    	    				    callback(the_dom)
								}
	    	                }
	    	    		}
	    	    	}
	    	    	else{
	    	    	    if(fixed_doms[k].contains(the_dom)){
	    	    	    	is_fixed_arr.push(true)
	    	    	    }
	    	    	    else{
	    	    	    	is_fixed_arr.push(false)
	    	    	    }
	    	    	}
	    	    }
	    	}
	    	else{
	    		break
	    	}
	    }
		
		if(is_continue){
			callback(the_first_dom)
		}
	})
}

function get_first_dom_in_article(callback){
	var article_doms_arr=wrap.$el.querySelector("#main").querySelectorAll("*")
	var article_content= wrap.$el.querySelector(".article_content")
	for(var i=0, l=article_doms_arr.length;i<l;i++){
		var the_dom=article_doms_arr[i]
		var rect=the_dom.getBoundingClientRect()
		if(rect.top>=0 || (rect.top<0 && rect.bottom>=0)){
			if(the_dom !== article_content){
				console.log(the_dom)
				callback(the_dom, rect.top>=0?rect.top:rect.top/rect.height)
			    break
			}
		}
	}
}

function get_desc(the_dom, times){
	//console.log(the_dom)
	var the_desc=""
	if(typeof the_dom.innerText !== "undefined"){
		the_desc=the_dom.innerText
	}
	if(typeof the_dom.wholeText !== "undefined"){
	    the_desc=the_dom.wholeText
	}

	if(the_desc.replace(/\s/g, "").length>1){
	    var p_arr=the_desc.replace(/^\s+/, "").split(/\n/)
	    for(var i=0;i<p_arr.length;i++){
	    	if(p_arr[i].replace(/\s/g, "").length>1){
	    		the_desc=p_arr[i]
	    		break
	    	}
	    }
	    mark(the_dom, the_desc)
	}
	else{
		if(times<5){
		    if(the_dom.nextSibling){
		    	get_desc(the_dom.nextSibling, times+1)
		    }
			else{
				mark(the_dom, the_desc)
				/*if(the_dom.parentNode.nextSibling){
				    get_desc(the_dom.parentNode.nextSibling, times+1)
				}
				else{
					mark(the_dom, the_desc)
				}*/
			}
		}
		else{
			mark(the_dom, the_desc)
		}
	}
}

function mark(the_dom, the_desc){
	var value     = window.scrollY
	var value_v   = (value/document.body.scrollHeight).toFixed(4)
	var points    = mark_point.points_reading_model
	var value_arr = []
	var desc_arr  = []
	var idx_value = null
	var idx_dom_in_article = null
	
	if(the_dom){
	    var article_doms_arr=wrap.$el.querySelector("#main").querySelectorAll("*")
		for(var i=0, l=article_doms_arr.length;i<l;i++){
			if(article_doms_arr[i] == the_dom){
				idx_dom_in_article=i
				break
			}
		}
	}
	
	the_desc=the_desc.replace(/^\s+/, "").replace(/\s+$/, "").split(/\n/)[0]
	the_desc=the_desc.substr(0, 50)+(the_desc.length>50?"...":"")
	
	points.forEach(function(item){
		value_arr.push(item.value)
		desc_arr.push(item.desc)
	})
	idx_value=value_arr.indexOf(value)
	
	if(idx_value == -1){ //去重
	    mark_point.title =wrap.title
	    mark_point.url   =wrap.web_url
	    mark_point.time  =Date.now()
		
		var point={}
		    point.value         = value
		    point.desc          = the_desc
		    point.article_width = wrap.article_style.width
		    //point.value_v       = value_v
		    point.idx_dom_in_article = idx_dom_in_article
		
		points.push(point)
		points.sort(function(a, b){
			return a.value - b.value
		})
	}
	else{
		var point=points[idx_value]
		    point.desc          = the_desc
		    point.article_width = wrap.article_style.width
		    //point.value_v       = value_v
			point.idx_dom_in_article = idx_dom_in_article
	}
	
	send_message("set_mark_point", {"path_name_base64":path_name_base64, "mark_point":mark_point, "is_reading_model":true})
}

function scroll_to_point(point){
	var value=0
	
	// article_width | value_v | idx_dom_in_article 为升级版本新增的属性
	if(typeof point.article_width !== "undefined"){
	    if(point.article_width == wrap.article_style.width){
	    	value=point.value
	    }
	    else{
			if(point.idx_dom_in_article !== null){
			    var article_doms_arr=wrap.$el.querySelector("#main").querySelectorAll("*")
				var dom=article_doms_arr[point.idx_dom_in_article]
				
				value=window.scrollY+(dom.getBoundingClientRect().top)
			}
			else{
				//value=document.body.scrollHeight*point.value_v
			}
	    }
	}
	else{
		value=point.value
	}
	
	window.scrollTo(0, value)
}

function get_date(timestamp){
	var date=new Date()
	var year=date.getFullYear()
	var month=date.getMonth()
	var day  =date.getDate()
	var today_start=0
	var date_desc=""
	date.setFullYear(year)
	date.setMonth(month)
	date.setDate(day)
	date.setHours(0)
	date.setMinutes(0)
	date.setSeconds(0)
	date.setMilliseconds(0)
	today_start=date.getTime()
	//console.log(today_start)
	date.setTime(timestamp)
	
	if(timestamp-today_start>=0){
		date_desc="今天"
	}
	else if(today_start-timestamp>0 && today_start-timestamp<=3600000*24){
		date_desc="昨天"
	}
	else if(today_start-timestamp>3600000*24 && today_start-timestamp<=3600000*48){
		date_desc="前天"
	}
	else{
		date_desc=formate(date.getMonth()+1)+"-"+formate(date.getDate())
	}
	return date_desc+" "+formate(date.getHours())+":"+formate(date.getMinutes())
}

function formate(num){
	if(num<10){
		return "0"+String(num)
	}
	else{
		return String(num)
	}
}

function postMessage_to_main_window(todo, data){
	var msg={}
	    msg.todo   = todo
	    msg.data   = data
	window.parent.postMessage(msg, "*")
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