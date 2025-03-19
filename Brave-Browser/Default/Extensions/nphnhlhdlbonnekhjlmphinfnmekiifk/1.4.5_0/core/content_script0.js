if(window.self==window.top){ //解决存在iframe的问题
    var style_hide_native_scrollbar=document.createElement("style")
    	style_hide_native_scrollbar.innerText="::-webkit-scrollbar{width:0px;height:3px}::-webkit-scrollbar-thumb{background-color:#c1c1c1;}::-webkit-scrollbar-thumb:hover{background-color:#666}"
	
	var is_hide_native_scrollbar = typeof localStorage.is_hide_native_scrollbar !== "undefined"?(["yes", "no"].indexOf(localStorage.is_hide_native_scrollbar)==-1?null:localStorage.is_hide_native_scrollbar=="yes"):null //使用 localStorage 数据会存在问题：第一次打开时没有数据、不能及时更新
    var t_hide_native_scrollbar=null
	var is_body_ready=false

    /* document.addEventListener("DOMContentLoaded", function(){
		num_finished_task+=1
		
		if(num_finished_task==2){
			start()
		}
	}) */
	//有些页面，链接改变了，但页面不会再触发$(document).ready()，也就是这时的 path_name 并未更新……
	//解决方法：chrome.tabs.onUpdated(()=>{})
	
	var main_scroll_wrap=null
	var is_need_get_main_scroll_wrap=true
	var is_got_top_fixed_dom_height=0
	var top_fixed_dom_height=0
	var mark_point = {}
	var function_key_now= []
	var point_idx=-1
	var is_show_iframe_el=false
	var setting_data={"top_progress_color":"blue", "is_top_progress_auto_hide":false, "is_need_scrollbar":true, "is_fixed_scroll_bar":false, "is_use_side_click":true, "is_use_mark_point":true, "is_display_points_num":true, "is_reading_mode_auto_full_screen":false}
	
	//for scrollbar
	var is_scroll_bar_ready=false
	var is_show_scroll_bar=false
	var is_need_set_scrollbar_data=false
	var is_auto_scrolling=false
	var t_hide_jindu=null
	
	var div0       = document.createElement('div')
	var div1       = document.createElement('div')
	var div_jindu  = document.createElement('div')
	
	//滚动条 iframe
	var iframe_sb  = document.createElement('div')
	const shadow = iframe_sb.attachShadow({ mode: "open" })

	//创建元素
	const scroll_bar=document.createElement("div")
	const sb_border=document.createElement("div")
	const sb_block_out=document.createElement("div")
	const sb_block=document.createElement("div")
	
	scroll_bar.setAttribute("class", "scroll_bar")
	sb_border.setAttribute("class", "sb_border")
	sb_block_out.setAttribute("class", "sb_block_out")
	sb_block.setAttribute("class", "sb_block")
	
	sb_block_out.appendChild(sb_block)
	scroll_bar.appendChild(sb_border)
	scroll_bar.appendChild(sb_block_out)
	
	//创建样式
    const style = document.createElement("style")
	
    style.textContent = `
	    .scroll_bar
	    {
		all: initial;
	    width :100vw;
	    height:100vh;
	    display:flex;
	    align-items:flex-start;
	    }
	    
	    /* .scroll_bar:hover
	    {
	    right:0px;
	    } */
	    
	    .scroll_bar .sb_border
	    {
	    width :2px;
	    height:100vh;
	    background:transparent;
	    }
	    
	    .scroll_bar .sb_block_out
	    {
	    width :16px;
	    height:100vh;
	    overflow:hidden;
	    background:rgba(240, 240, 240, 0);
	    cursor:pointer;
	    }
	    
	    .scroll_bar .sb_block
	    {
	    width :16px;
	    height:100px;
	    background-image:url(`+chrome.runtime.getURL("img/pinstriped_suit.png")+`);
	    /* background-color:rgba(0,0,0,0.5); */ /*#cdcdcd*/
	    /* transition:background-color 200ms; */
	    box-sizing:border-box;
	    opacity:0.8;
	    user-select:none;
        -webkit-user-drag:none;
	    }
	    
	    .scroll_bar .sb_block:hover
	    {
	    background-color:#000; /*a6a6a6*/
	    /* background-image:linear-gradient(-225deg, #231557 0%, #44107A 29%, #FF1361 67%, #FFF800 100%); */
	    }
	    
	    .scroll_bar .new_year
	    {
	    width :100%;
	    height:100%;
	    display:none;
	    flex-direction:column;
	    justify-content:center;
	    align-items:center;
	    pointer-events:none;
	    }
	    
	    .scroll_bar .new_year div
	    {
	    margin-bottom:2px;
	    display:flex;
	    justify-content:center;
	    align-items:center;
	    width:15px;
	    height:15px;
	    }
	    
	    .scroll_bar .new_year p
	    {
	    color:#666;
	    font-size:12px;
	    font-style:italic;
	    font-weight:bold;
	    }
    `
	
    // Attach the created elements to the shadow dom
	shadow.appendChild(style)
	shadow.appendChild(scroll_bar)
	
    var is_can_move       = false
    var is_moved          = false
                            
    var sb_block_offset_y = 0
    var sb_block_y0       = 0
    var sb_block_y        = 0
    var sb_block_h        = 0
    
    var is_use_side_click = false
    var num_screen        = 0
    
    //开始拖动
    sb_block.onmousedown=function(e){
    	sb_block_offset_y = e.offsetY //e.target.clientHeight/2
    	sb_block_y0       = e.clientY
        is_can_move       = true
    	is_moved          = false
    }
	
    //拖动中
    scroll_bar.onmousemove=function(e){
        if(is_can_move){
    		if(e.clientY !== sb_block_y0){
    			sb_block_y0=e.clientY
    		    to_scroll(e.clientY-sb_block_offset_y)
    		}
    	}
    }
    
    //滑槽 鼠标按下
    sb_block_out.onmousedown=function(e){
    	if(e.currentTarget == e.target){ //限定滑槽 only
    	    var sb_block_height=getComputedStyle(sb_block).height.replace("px", "")
    	    if(e.offsetX !== 1){
    	        if(is_use_side_click){
    	        	if(e.offsetX !== e.target.clientWidth-1){
    	        		to_scroll(e.clientY-sb_block_height/2)
    	        	}
    	        }
    	        else{
    	        	to_scroll(e.clientY-sb_block_height/2)
    	        }
    	    }
    	}
    }
    
    //双击，因为和会同时触发定义了动作的单击，所以停用
    /* sb_block.ondblclick=function(e){
    	if(is_use_side_click){
    	    if(e.offsetX !== e.target.clientWidth-1){
    	        postMessage_to_main_window("switch_is_fixed_scroll_bar", {})
    	    }
    	}
    	else{
    		postMessage_to_main_window("switch_is_fixed_scroll_bar", {})
    	}
    } */
    
    //整体 鼠标抬起
    scroll_bar.onmouseup=function(e){
    	if(!is_moved){
    		if(e.target == sb_block){
    			quickly_scroll(e)
    		}
    		else{
    	        if(e.clientX==0 || e.clientX==e.currentTarget.clientWidth-1){
    		    	if(is_use_side_click){
    	        	    quickly_scroll(e)
    	        	}
    	        }
    		}
    	}
    	else{
    		postMessage_to_main_window("end_scroll", {})
    	}
    	
    	is_can_move=false
    	is_moved=false
    }
    
    scroll_bar.oncontextmenu=function(e){
    	e.preventDefault()
    	e.stopPropagation()
    }
    
    //鼠标滚动滚轮事件
    /* sb_block_out.onmousewheel=function(e){
    	var sb_block_height=getComputedStyle(sb_block).height.replace("px", "")
    	e.stopPropagation()
    	e.preventDefault()
    	
    	//to_scroll(sb_block_y+(e.deltaY>0?1:-1)*(window.innerHeight-sb_block_height)/num_screen/2)
    	
    	postMessage_to_main_window("scroll_by_mousewheel", {delta_y:e.deltaY})
    } */
    
    /* //新年彩蛋
    var date =new Date()
    var year =date.getFullYear()
    var month=date.getMonth()
    var day  =date.getDate()
    var date_text=year+"-"+(month+1)+"-"+day
    if(date_text=="2021-1-1"){
    	//new_year.style.display="flex"
    } */
    
    //postMessage_to_main_window("scroll_bar_is_ready", {})
	is_scroll_bar_ready=true
	
	if(setting_data.is_need_scrollbar){
		if(setting_data.is_fixed_scroll_bar){
			div_jindu.style.opacity="0"
			is_need_set_scrollbar_data=true
	        deal_on_main_scroll()
		}
	}
	
	//阅读模式 iframe
	var iframe_el  = document.createElement('iframe')
	var article_el = document.createElement('div')
	
	div0.className         = "my_noscrollbar"
	div1.className         = "my_noscrollbar"
	div_jindu.className    = "my_noscrollbar_jindu"
	
	iframe_sb.className    = "my_noscrollbar_scroll_bar_iframe"
	
	iframe_el.className    = "reading_model_iframe"
	article_el.className   = "article_el_3721"
	
	div0.style.top="0px"
	div1.style.top="30vh"
	div0.style.height="30vh"
	div1.style.height="70vh"
	div0.style.background="#3A89C9"
	div1.style.background="#FC354C"
	
	iframe_el.frameBorder="0"
	iframe_el.width =window.innerWidth
	iframe_el.height=window.innerHeight
	iframe_el.scrolling="auto"
	
	div0.onclick=function(){ // scroll to bottom
		if(!is_show_iframe_el){
			var box_height = main_scroll_wrap==document.body?window.innerHeight:main_scroll_wrap.getBoundingClientRect().height
			
			if(main_scroll_wrap == document.body){
				$("html,body").animate({scrollTop:(document.documentElement.scrollHeight-box_height)+"px"}, 300, "linear", ()=>{
					is_auto_scrolling=false
					is_need_set_scrollbar_data=true
				})
			}
			else{
				$(main_scroll_wrap).animate({scrollTop:(main_scroll_wrap.scrollHeight-box_height)+"px"}, 300, "linear", ()=>{
					is_auto_scrolling=false
					is_need_set_scrollbar_data=true
				})
			}
		}
		else{
			postMessage_to_iframe("scroll_to_bottom", "")
		}
	}
	
	div1.onclick=function(){ // scroll to top
		if(!is_show_iframe_el){
		    if(main_scroll_wrap == document.body){
				$("html,body").animate({scrollTop:"0px"}, 300, "linear", ()=>{
					is_auto_scrolling=false
					is_need_set_scrollbar_data=true
				})
			}
			else{
				$(main_scroll_wrap).animate({scrollTop:"0px"}, 300, "linear", ()=>{
					is_auto_scrolling=false
					is_need_set_scrollbar_data=true
				})
			}
		}
		else{
			postMessage_to_iframe("scroll_to_top", "")
		}
	}
	
	/* div_jindu.onclick=function(){
		color_input.click()
	} */
	
	//处理是否显示自定义滚动条 iframe
	iframe_sb.onmouseover=function(e){
		is_need_set_scrollbar_data=true
		deal_on_main_scroll()
		
		if(setting_data.is_need_scrollbar){
			document.body.style.userSelect="none"
			
			iframe_sb.style.transition="80ms"
		    iframe_sb.style.transform="translate3d(-17px, 0px, 0px)"
			is_show_scroll_bar=true
		}
	}
	
	iframe_sb.onmouseout=function(e){
		document.body.style.userSelect="text"
		
		if(setting_data.is_need_scrollbar){
			if(!setting_data.is_fixed_scroll_bar){
				is_need_set_scrollbar_data=false
				
				this.style.transition="80ms"
			    this.style.transform="translate3d(0px, 0px, 0px)"
				is_show_scroll_bar=false
				div_jindu.style.opacity="1"
			}
			else{
				if(!is_auto_scrolling){
				    is_need_set_scrollbar_data=true
				}
			}
			
			fun_custom_scrollbar_run("end_move", {})
		}
		else{
			is_need_set_scrollbar_data=false
			
			this.style.transition="80ms"
			this.style.transform="translate3d(0px, 0px, 0px)"
			is_show_scroll_bar=false
			div_jindu.style.opacity="1"
		}
	}
	
	document.onclick=function(e){ // 点击 popup 也会触发，触发时坐标(0,0)
	    if(!is_show_iframe_el){
			if(setting_data.is_use_side_click){
				/* if(e.clientX==window.innerWidth-1){
					if(!is_draged){
		        	    if(e.clientY>=window.innerHeight*0.3){
		        	    	div1.click()
		        	    }
		        	    else{
		        	    	div0.click()
		        	    }
					}
		        } */
		        
		        if(e.clientX==0){
		        	if(e.clientY !== 0){
						if(!is_got_top_fixed_dom_height){
							is_got_top_fixed_dom_height=true
							get_top_fixed_dom_height((fixed_doms, top_fixed_dom_height_get)=>{
		                    	top_fixed_dom_height=top_fixed_dom_height_get
		                    	//alert(top_fixed_dom_height)
		                    })
						}
						
		        		var scroll_top = main_scroll_wrap==document.body?window.scrollY:main_scroll_wrap.scrollTop
			    		var box_height = main_scroll_wrap==document.body?window.innerHeight:main_scroll_wrap.getBoundingClientRect().height
			    		var scroll_wrap = main_scroll_wrap==document.body?window:main_scroll_wrap
			    		
						box_height=box_height-top_fixed_dom_height
						
		        	    if(e.clientY>=window.innerHeight*0.5){
		        			scroll_wrap.scrollTo(0, scroll_top+box_height)
		        	    }
		        	    else{
		        			scroll_wrap.scrollTo(0, scroll_top-box_height)
		        	    }
		        	}
		        }
			}
		}
	}
	
	document.ondblclick=function(e){
		if(!is_show_iframe_el){
			if(e.clientX !== 0 && e.clientX !== window.innerWidth-1){
				if(setting_data.is_use_mark_point){
		        	get_first_dom_in_scrollview(e.target, (the_dom)=>{
						if(the_dom){
	                	    get_desc(the_dom, 1)
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
		if(!is_show_iframe_el){
		    if(function_key_now.length==1){  //确保只有一个键被按下
		        if(function_key_now[0]==17){ //Crtl
				    if(setting_data.is_use_mark_point){
		    	        var points=mark_point.points_normal
		    	        if(typeof points !== "undefined" && points.length>0){
					    	if(point_idx<points.length-1){
		    	        	    point_idx+=1
		    	        	}
		    	        	else{
		    	        		point_idx=0
		    	        	}
					    	
					    	if(main_scroll_wrap==document.body){
				            	document.body.style.transition="0ms"
					    		window.scrollTo(0, points[point_idx].value)
				            }
				            else{
				            	main_scroll_wrap.style.transition="0ms"
				            	main_scroll_wrap.scrollTo(0, points[point_idx].value)
				            }
		    	        }
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
		}
	}
	
	/* document.addEventListener("visibilitychange", function(){
		if(!document.hidden){
			//如果以这样的方式 changeBadgeText, 会导致切换到 newtab 等特殊页面时无法触发
			send_message("changeBadgeText", {"num":mark_point.points_reading_model.length})
		}
	}) */
	
	window.addEventListener("message", function(e){
		var msg_obj = e.data
	    var todo    = ""
		
		if(typeof msg_obj.todo !== "undefined"){
			todo = msg_obj.todo
			
		    if(todo=="scroll_bar_is_ready"){
		    	is_scroll_bar_ready=true
		    	
		    	if(setting_data.is_need_scrollbar){
		    		if(setting_data.is_fixed_scroll_bar){
		    			div_jindu.style.opacity="0"
		    			is_need_set_scrollbar_data=true
	                    deal_on_main_scroll()
		    		}
		    	}
		    }
		    else if(todo=="scroll_main_page"){
		    	is_need_set_scrollbar_data=false
		    	
		    	var scroll_wrap = main_scroll_wrap==document.body?window:main_scroll_wrap
		    	scroll_wrap.scrollTo(0, msg_obj.data.y/(window.innerHeight-msg_obj.data.h)*((main_scroll_wrap==document.body?document.documentElement.scrollHeight:main_scroll_wrap.scrollHeight)-window.innerHeight))
		    	window.focus()
		    }
		    else if(todo=="end_scroll"){
		    	is_need_set_scrollbar_data=true
		    }
		    else if(todo=="scroll_to_top_or_bottom"){
		    	var fx=msg_obj.data.fx
		    	is_need_set_scrollbar_data=false
		    	is_auto_scrolling=true
		    	
		    	fun_custom_scrollbar_run("start_auto_scrolling", {})
		    	
		    	if(fx=="top"){
		    		div1.click()
		    	}
		    	else{
		    		div0.click()
		    	}
		    	window.focus()
		    }
		    else if(todo=="scroll_by_mousewheel"){
		    	is_need_set_scrollbar_data=true
		    	
		    	var scroll_wrap = main_scroll_wrap==document.body?window:main_scroll_wrap
		    	var scroll_top   = main_scroll_wrap==document.body?window.scrollY:main_scroll_wrap.scrollTop
		    	
		    	scroll_wrap.scrollTo(0, scroll_top+msg_obj.data.delta_y)
		    }
		    /* else if(todo=="switch_is_fixed_scroll_bar"){
		    	setting_data.is_fixed_scroll_bar = !setting_data.is_fixed_scroll_bar
		    	chrome.storage.local.set({"setting_data": setting_data})
		    	
		    	apply_setting_data()
		    	send_message("sync_content_script_data")
		    } */
		    
		    else if(todo=="display_iframe"){
		    	is_show_iframe_el=true
		    	iframe_el.style.opacity="1"
		    	send_message("changeBadgeText", {"num":mark_point.points_reading_model.length})
		    	auto_full_screen(true)
		    }
		    else if(todo=="close"){
		    	is_show_iframe_el=false
		    	//不要设置 display 为 none，否则可能导致其内部的 iframe 重载
		    	iframe_el.style.transform="translate3d(100vw, 0px, 0px)"
		    	iframe_el.style.opacity="0"
		    	send_message("changeBadgeText", {"num":mark_point.points_normal.length})
		    	window.focus()
		    	auto_full_screen(false)
		    }
		    else if(todo=="fullscreen"){
		    	if(!document.webkitFullscreenElement){
    	        	document.documentElement.webkitRequestFullScreen()
    	        }
    	        else{
    	        	document.webkitCancelFullScreen()
    	        }
		    }
		    else if(todo=="set_bg_color"){
		    	iframe_el.style.backgroundColor=msg_obj.data.color
		    }
		}
	})
	
	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
		var todo=message.todo
		
		if(todo=="show_scrollbar"){
			if(!document.body.contains(div0)){
			    document.body.appendChild(div0)
	            document.body.appendChild(div1)
				
				setTimeout(function(){
	    	    	document.body.removeChild(div0)
	                document.body.removeChild(div1)
	    	    }, 8000)
			}
		}
		
		else if(todo=="get_path_name"){
			if(!is_show_iframe_el){
			    var obj={}
			        obj.path_name_base64 = get_path_name_base64()
			        obj.page_url  = location.href
			        obj.page_host = location.host
			        obj.is_reading_model = is_show_iframe_el
					obj.is_normal_tab    = true
			    
				sendResponse(obj)
			}
		}
		
		else if(todo=="change_top_progress_color"){
			sendResponse({"is_can_deal":true})
			
			div_jindu.style.opacity="1"
			div_jindu.style.width="50vw"
			if(!document.body.contains(color_input)){
				document.body.appendChild(color_input)
			}
			color_input.click()
		}
		
		else if(todo=="update_content_script_data"){
			get_setting_data()
		}
		
		else if(todo=="callback_mark_point"){
			mark_point=message.extra
		}
		
		else if(todo=="sync_mark_point"){
	    	var extra=message.extra
	    	if(get_path_name_base64() == extra.path_name_base64){
	    	    mark_point=extra.mark_point
	    	}
	    }
		
		else if(todo=="to_point"){
			var value=message.extra.point.value
			if(!is_show_iframe_el){
				if(main_scroll_wrap==document.body){
					window.scrollTo(0, value)
				}
				else{
					main_scroll_wrap.style.transition="0ms"
					main_scroll_wrap.scrollTo(0, value)
				}
			}
		}
		
		else if(todo=="write_to_desc"){
			if(!is_show_iframe_el){
			    var the_desc=window.getSelection().toString()
			    mark(the_desc)
			}
		}
		
		else if(todo=="update_is_hide_native_scrollbar"){
			if(location.host == message.extra.host){
			    set_scrollbar_type(message.extra.is_hide_native_scrollbar)
			}
		}
		
		else if(todo=="get_article_url"){
			sendResponse({"url":location.href, "path_name_base64":get_path_name_base64()})
		}
		
		else if(todo=="open_reading_mode"){
			if(message.extra.status){
			    if(!document.body.contains(iframe_el)){
			        iframe_el.src=chrome.extension.getURL("pages/reading_model.html")+"#"+get_path_name_base64()+"_0_0_"+message.extra.theme
			        document.body.appendChild(iframe_el)
			    }
			    else{
			    	if(!is_show_iframe_el){
			    		is_show_iframe_el=true
						iframe_el.style.transform="translate3d(0px, 0px, 0px)"
						iframe_el.style.opacity="1"
			    	    postMessage_to_iframe("is_display_page", "")
			    	    send_message("changeBadgeText", {"num":mark_point.points_reading_model.length})
						auto_full_screen(true)
			    	}
			    }
			}
		}
		else if(todo=="close_tab"){
			sendResponse({"status":"can_close"})
			window.close()
		}
		
		else if(todo=="callback_get_mark_point"){
			mark_point=message.extra.mark_point
	    	//console.log(mark_point)
	    	
	    	get_setting_data()
		}
		
		else if(todo=="callback_check_is_hide_native_scrollbar1"){
			is_hide_native_scrollbar = message.extra.value
	    	localStorage.is_hide_native_scrollbar=is_hide_native_scrollbar?"yes":"no"
			
			if(is_body_ready){
				start()
			}
			else{
	    	    t_hide_native_scrollbar=setInterval(()=>{
                	if(is_body_ready){
                		clearInterval(t_hide_native_scrollbar)
						start()
                	}
                }, 5)
			}
		}
		
		else if(todo=="callback_check_is_hide_native_scrollbar2"){
			if(message.extra.value !==is_hide_native_scrollbar){
        	    is_hide_native_scrollbar = message.extra.value
	    	    localStorage.is_hide_native_scrollbar=is_hide_native_scrollbar?"yes":"no"
			    
			    start()
			}
		}
	})
	
	window.onload=function(){
		//alert("onload")
		
		is_need_get_main_scroll_wrap=true
		ready_scrollbar()
		is_need_get_main_scroll_wrap=false
	}
	
	if(is_hide_native_scrollbar == null){
		observe_el(document.documentElement, (observer, data_arr)=>{
			if(document.body){
				observer.disconnect()
				
	        	is_body_ready=true
	    	}
		})
		
	    send_message("check_is_hide_native_scrollbar1", {"host":location.host}/* , function(is_hide_native_scrollbar_get){
        	is_hide_native_scrollbar = is_hide_native_scrollbar_get
	    	localStorage.is_hide_native_scrollbar=is_hide_native_scrollbar?"yes":"no"
			
			if(is_body_ready){
				start()
			}
			else{
	    	    t_hide_native_scrollbar=setInterval(()=>{
                	if(is_body_ready){
                		clearInterval(t_hide_native_scrollbar)
						start()
                	}
                }, 5)
			}
        } */)
	}
	else{
		observe_el(document.documentElement, (observer, data_arr)=>{
			if(document.body){
				observer.disconnect()
				
				is_body_ready=true
				
				if(is_hide_native_scrollbar){
					if(!document.body.contains(style_hide_native_scrollbar)){
			            document.body.appendChild(style_hide_native_scrollbar)
					}
				}
				
				start(()=>{
					send_message("check_is_hide_native_scrollbar2", {"host":location.host}/* , function(is_hide_native_scrollbar_get){
						if(is_hide_native_scrollbar_get !==is_hide_native_scrollbar){
        	                is_hide_native_scrollbar = is_hide_native_scrollbar_get
	    	                localStorage.is_hide_native_scrollbar=is_hide_native_scrollbar?"yes":"no"
			                
			                start()
						}
					} */)
				})
			}
		})
		
		document.addEventListener("DOMContentLoaded", function(){
			if(is_hide_native_scrollbar){
				if(!document.body.contains(style_hide_native_scrollbar)){
			        document.body.appendChild(style_hide_native_scrollbar)
				}
				
			    if(!document.body.contains(iframe_sb)){
	            	document.body.appendChild(iframe_sb)
	            }
				
				if(!document.body.contains(div_jindu)){
	            	document.body.appendChild(div_jindu)
	            }
			}
		})
	}
	
	function start(callback){
		if(is_hide_native_scrollbar){
			//document.body.appendChild(style_hide_native_scrollbar)
			if(!document.body.contains(div_jindu)){
	    	    document.body.appendChild(div_jindu)
			}
	        //document.body.appendChild(iframe_sb)
	    
	        ready_scrollbar()
        }
		else{
			if(document.body.contains(style_hide_native_scrollbar)){
			    document.body.removeChild(style_hide_native_scrollbar)
			}
		}
		
		//确保 iframe_sb Dom 存在
	    /* window.onmousemove=function(){
	    	//check_style_hide_native_scrollbar()
	    	
	    	//主页面 focus
	    	//window.focus()
	    } */
		
		//init mark_point
	    send_message("get_mark_point", {"path_name_base64":get_path_name_base64()}/* , function(c){
	    	mark_point=c
	    	//console.log(mark_point)
	    	
	    	get_setting_data()
	    } */)
		
		if(callback){
			callback("finish")
		}
	}
	
	function ready_scrollbar(){
		if(is_hide_native_scrollbar){
			to_get_main_scroll_wrap()
			
			if(false){
				//未使用
			    observe_el(document.body, (observer, data_arr)=>{
			    	//if(is_need_get_main_scroll_wrap){
	            	    to_get_main_scroll_wrap(observer)
	            	/* }
	            	else{
	            		deal_on_main_scroll()
	            	} */
			    })
			}
		}
	}
	
	function to_get_main_scroll_wrap(observer){
		get_main_scroll_wrap((main_scroll_wrap_get)=>{
	    	// important
			if(main_scroll_wrap_get.onscroll !== null){
	    	    if(typeof observer !== "undefined"){
			    	is_need_get_main_scroll_wrap=false
			    	observer.disconnect()
	    	    }
			}
	    	
	    	if(main_scroll_wrap_get !== main_scroll_wrap){
	    	    main_scroll_wrap=main_scroll_wrap_get
	    	    main_scroll_wrap.onscroll=function(e){
	            	//console.log(e)
					check_style_hide_native_scrollbar()
					
					deal_on_main_scroll(e)
	            }
	    	}
			
			deal_on_main_scroll()
	    })
	}
	
	function get_main_scroll_wrap(callback){
		var main_scroll_wrap=document.body
		
		if(document.body.getBoundingClientRect().height == window.innerHeight){
		    var all_node=document.body.querySelectorAll("div, main, article, section")
		    var wrap_arr_scroll =[]
		    var wrap_arr_visible=[]
		    
		    all_node.forEach((node)=>{
		    	var style=getComputedStyle(node);
		    	var rect=node.getBoundingClientRect()
		    	var box_h=rect.height
		    	var box_w=rect.width
		    	var scroll_h=node.scrollHeight //是否需要与 window.innerHeight 比较？
		    	var win_width =window.innerWidth
		    	var win_height=window.innerHeight
		    	
		    	if(style.display !== "none" && style.visibility == "visible"){
		    	    if(["auto", "scroll"].indexOf(style.overflowY) !== -1){
		    	    	if(win_width-box_w >= 0 && win_width-box_w < 100 && win_height-box_h >= 0 && win_height-box_h < 100){
		    	    	    wrap_arr_scroll.push({"node":node, "box_h":box_h, "box_w":box_w, "scroll_h":scroll_h})
		    	    	}
		    	    }
		    	}
		    	
		    	//overflow=="visible" 的元素没有 onscroll 事件，也不能执行scrollTo(x, y)
		    	/* if(ofy=="visible"){
		    		if(scroll_h > win_height && box_w < win_width){
		    			wrap_arr_visible.push({"node":node, "box_h":box_h, "box_w":box_w, "scroll_h":scroll_h})
		    		}
		    	} */
		    })
		    
		    if(wrap_arr_scroll.length>0 || wrap_arr_visible.length>0){
		    	//如何进一步判断？
		    	var wrap_arr=wrap_arr_scroll.concat(wrap_arr_visible)
		    	
		    	wrap_arr.sort((a, b)=>{ //面积
		        	return b.box_w*b.box_h - a.box_w*a.box_h
		        })
		        
		        main_scroll_wrap=wrap_arr[0].node
		    	
		        //console.log("滚动容器:")
		        //console.log(wrap_arr)
		    }
		}
		
		if(callback){
			callback(main_scroll_wrap)
		}
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
    	        	
    	    if(["fixed", "sticky"].indexOf(style.position) !== -1){
    			fixed_doms.push(the_dom)
				
    	        if(style.display !== "none" 
    			&& rect.top==0 
    	        && rect.width >= clientWidth/2 
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
		    /* console.log(fixed_doms)
		    console.log(top_bar_h_arr)
		    console.log(top_fixed_dom_height) */
		    callback(fixed_doms, top_fixed_dom_height)
		}
	}
	
	function check_style_hide_native_scrollbar(){
		if(is_hide_native_scrollbar){
			if(!document.body.contains(style_hide_native_scrollbar)){
	        	document.body.appendChild(style_hide_native_scrollbar)
	        }
	    	if(!document.body.contains(div_jindu)){
	        	document.body.appendChild(div_jindu)
	        }
	        if(!document.body.contains(iframe_sb)){
	        	document.body.appendChild(iframe_sb)
	        }
	    }
	}
	
	function deal_on_main_scroll(e){
		if(typeof e !== "undefined"){
			//console.log(e)
			if(e.target == main_scroll_wrap){
				do_deal_on_main_scroll()
			}
			else{
				if(e.target == document && main_scroll_wrap == document.body){
					do_deal_on_main_scroll()
				}
			}
		}
		else{
			do_deal_on_main_scroll()
		}
	}
	
	function do_deal_on_main_scroll(){
		if(is_hide_native_scrollbar && main_scroll_wrap !== null){
		    var scroll_top   = main_scroll_wrap==document.body?window.scrollY:main_scroll_wrap.scrollTop
		    var scroll_wrap_height=Math.max(window.innerHeight, main_scroll_wrap==document.body?document.documentElement.scrollHeight:main_scroll_wrap.scrollHeight)
	        var scroll_height_enable =scroll_wrap_height-window.innerHeight
		    
		    //计算
		    var sb_block_height=Math.max(100, window.innerHeight/(scroll_wrap_height/window.innerHeight))
		    
		    sb_block_y=scroll_height_enable>0?scroll_top/scroll_height_enable*(window.innerHeight-sb_block_height):0
		    
		    div_jindu.style.width   = scroll_top/scroll_height_enable*100+"vw"
		    div_jindu.style.opacity = is_show_scroll_bar?"0":"1"
			
		    if(setting_data.is_top_progress_auto_hide){
		        if(getComputedStyle(div_jindu).opacity === "1"){
		            if(t_hide_jindu){
		            	clearInterval(t_hide_jindu)
		            	t_hide_jindu=null
		            }
		            t_hide_jindu=setTimeout(()=>{
						div_jindu.style.transition="150ms"
		                div_jindu.style.opacity="0"
						
						t_hide_jindu=setTimeout(()=>{
		                	div_jindu.style.transition="0ms"
		                }, 150)
		            }, 1000)
		        }
		    }
		    
		    if(is_need_set_scrollbar_data){
		        fun_custom_scrollbar_run("set_scrollbar_data", {"h":sb_block_height, "y":sb_block_y, "win_h":window.innerHeight, "num_screen":scroll_height_enable/window.innerHeight, "is_use_side_click":setting_data.is_use_side_click})
		    }
		}
	}
	
	function to_scroll(client_y){
    	var sb_block_height=getComputedStyle(sb_block).height.replace("px", "")
    	
    	is_moved=true
    	sb_block_y=client_y
    	sb_block_y=Math.max(sb_block_y, 0)
    	sb_block_y=Math.min(window.innerHeight-sb_block_height, sb_block_y)
    	
    	sb_block.style.transition="0ms"
    	sb_block.style.transform="translate3d(0, "+sb_block_y+"px, 0)"
    	
    	//postMessage_to_main_window("scroll_main_page", {"h":sb_block_height, "y":sb_block_y})
		
		is_need_set_scrollbar_data=false
		
		var scroll_wrap = main_scroll_wrap==document.body?window:main_scroll_wrap
		scroll_wrap.scrollTo(0, sb_block_y/(window.innerHeight-sb_block_height)*((main_scroll_wrap==document.body?document.documentElement.scrollHeight:main_scroll_wrap.scrollHeight)-window.innerHeight))
		window.focus()
    }
	
	function fun_custom_scrollbar_run(todo, msg_obj){
    	if(todo=="set_scrollbar_data"){
    		//alert(msg_obj.data.y)
    		is_use_side_click=msg_obj.is_use_side_click
    		num_screen=msg_obj.num_screen
    		sb_block_h=msg_obj.h
    		sb_block_y=msg_obj.y
    		
			sb_block.style.opacity = sb_block_h==msg_obj.win_h ? 0 : 0.8
    		sb_block.style.height = sb_block_h+"px"
    		sb_block.style.transition = "0ms"
    		sb_block.style.transform = "translate3d(0, "+sb_block_y+"px, 0)"
    	}
    	
    	else if(todo=="start_auto_scrolling"){
    		sb_block.style.transition="300ms linear"
    	    sb_block.style.transform="translate3d(0, "+sb_block_y+"px, 0)"
    	}
    	
    	else if(todo=="end_move"){
    		is_can_move=false
    	    is_moved=false
    	}
    }
    
    function quickly_scroll(e){
    	var fx=""
    	if(e.clientY>=window.innerHeight*0.3){
    		fx="top"
    	}
    	else{
    		fx="bottom"
    	}
    	
    	sb_block_y = fx=="top"?0:window.innerHeight-getComputedStyle(sb_block).height.replace("px", "")
    	
    	//postMessage_to_main_window("scroll_to_top_or_bottom", {"fx":fx})
		
		is_need_set_scrollbar_data=false
		is_auto_scrolling=true
		
		fun_custom_scrollbar_run("start_auto_scrolling", {})
		
		if(fx=="top"){
			div1.click()
		}
		else{
			div0.click()
		}
		window.focus()
    }
    
    function postMessage_to_main_window(todo, data, callback){
    	var msg={}
    	    msg.todo   = todo
    	    msg.data   = data
    	window.parent.postMessage(msg, "*")
    	
    	if(callback){
    	    callback("finish")
    	}
    }
	
	function get_setting_data(callback){
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
	    		
	    		setting_data=c.setting_data
				apply_setting_data()
				
				if(callback){
					callback("finish")
				}
	    	}
	    })
	}
	
	function apply_setting_data(){
		div_jindu.style.background=setting_data.top_progress_color
		
		if(setting_data.is_need_scrollbar){
			if(setting_data.is_fixed_scroll_bar){
				div_jindu.style.opacity="0"
				is_need_set_scrollbar_data=true
			    
	    	    iframe_sb.style.transition="0ms"
	    	    iframe_sb.style.transform="translate3d(-17px, 0px, 0px)"
				is_show_scroll_bar=true
				
				if(is_scroll_bar_ready){
					if(is_hide_native_scrollbar){
	    	            deal_on_main_scroll()
					}
			    }
			}
			else{
				div_jindu.style.opacity="1"
				is_need_set_scrollbar_data=false
			    
			    iframe_sb.style.transition="0ms"
		        iframe_sb.style.transform="translate3d(0px, 0px, 0px)"
				is_show_scroll_bar=false
			}
		}
		else{
			div_jindu.style.opacity="1"
			is_need_set_scrollbar_data=false
			    
			iframe_sb.style.transition="0ms"
		    iframe_sb.style.transform="translate3d(0px, 0px, 0px)"
			is_show_scroll_bar=false
		}
		
		if(setting_data.is_top_progress_auto_hide){
			div_jindu.style.opacity="0"
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
		    					//只在 reading_model.html 中可以等于 top_fixed_dom_height
    	    	    			if(the_dom.getBoundingClientRect().top > top_fixed_dom_height){
									if(!is_got_first_dom){
										is_got_first_dom=true
									    the_first_dom=the_dom
									}
									
									if(style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"){
    	    	    				    is_continue=false
									    //console.log(the_dom)
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
	
	function get_desc(the_dom, times){
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
		    mark(the_desc)
		}
		else{
			if(times<5){
			    if(the_dom.nextSibling){
			    	get_desc(the_dom.nextSibling, times+1)
			    }
				else{
					mark(the_desc)
					/*if(the_dom.parentNode.nextSibling){
					    get_desc(the_dom.parentNode.nextSibling, times+1)
					}
					else{
						mark(the_desc)
					}*/
				}
			}
			else{
				mark(the_desc)
			}
		}
	}
	
	function mark(the_desc){
		var scroll_top = main_scroll_wrap==document.body?window.scrollY:main_scroll_wrap.scrollTop
		var points=mark_point.points_normal
		var value_arr=[]
		
		the_desc = the_desc.replace(/^\s+/, "").replace(/\s+$/, "").split(/\n/)[0]
		the_desc = the_desc.substr(0, 50)+(the_desc.length>50?"...":"")
		the_desc = the_desc==""?"No title":the_desc
		
		points.forEach(function(item){
			value_arr.push(item.value)
		})
		
		if(value_arr.indexOf(scroll_top) == -1){//去重
			mark_point.title = document.title!==""?document.title:location.href
		    mark_point.url   = location.href
		    mark_point.time  = Date.now()
			points.push({"value":scroll_top, "desc":the_desc})
			
			points.sort(function(a, b){
				return a.value - b.value
			})
		}
		else{
			var idx=value_arr.indexOf(scroll_top)
			points[idx].desc=the_desc
		}
		
		send_message("set_mark_point", {"path_name_base64":get_path_name_base64(), "mark_point":mark_point, "is_reading_model":false})
		//console.log(mark_point)
		
		/* if(document.body.contains(iframe_el)){
			postMessage_to_iframe("sync_mark_point", mark_point)
		} */
	}
	
	function set_scrollbar_type(value){
		if(typeof value !== "undefined"){
		    is_hide_native_scrollbar = value
			localStorage.is_hide_native_scrollbar=is_hide_native_scrollbar?"yes":"no"
		}
		
		if(is_hide_native_scrollbar){
			if(!document.body.contains(style_hide_native_scrollbar)){
	        	document.body.appendChild(style_hide_native_scrollbar)
	        }
			else{
				document.body.removeChild(style_hide_native_scrollbar)
				document.body.appendChild(style_hide_native_scrollbar)
			}
			
			if(!document.body.contains(div_jindu)){
	        	document.body.appendChild(div_jindu)
	        }
	        if(!document.body.contains(iframe_sb)){
	        	document.body.appendChild(iframe_sb)
	        }
			
			get_main_scroll_wrap((main_scroll_wrap_get)=>{
				if(main_scroll_wrap_get !== main_scroll_wrap){
	    		    main_scroll_wrap=main_scroll_wrap_get
	    		    main_scroll_wrap.onscroll=function(e){
	    	        	deal_on_main_scroll(e)
	    	        }
	    		}
				deal_on_main_scroll()
			})
		}
		else{
			if(document.body.contains(style_hide_native_scrollbar)){
			    document.body.removeChild(style_hide_native_scrollbar)
			}
			if(document.body.contains(div_jindu)){
			    document.body.removeChild(div_jindu)
			}
			if(document.body.contains(iframe_sb)){
			    document.body.removeChild(iframe_sb)
			}
		}
	}
	
	function auto_full_screen(is_full){
		if(setting_data.is_reading_mode_auto_full_screen){
			if(is_full){
				document.documentElement.webkitRequestFullScreen()
			}
			else{
				document.webkitCancelFullScreen()
			}
		}
	}
	
	function get_path_name_base64(){
		var path=location.hostname+location.pathname+location.search
		return Base64.encode(path)
	}
	
	function observe_el(el, callback){
		var observer = new MutationObserver(function(data_arr){
			callback(observer, data_arr)
		})
		observer.observe(el, {childList:true, subtree: true})
	}
	
	// to artical page
	function postMessage_to_iframe(todo, data){
    	var msg={}
    	    msg.todo   = todo
    	    msg.data   = data
    	iframe_el.contentWindow.postMessage(msg, "*")
    }
	
	/* function fun_custom_scrollbar_run(todo, data){
    	if(typeof iframe_sb.contentWindow !== "undefined"){
		    var msg={}
    	        msg.todo   = todo
    	        msg.data   = data
    	    iframe_sb.contentWindow.postMessage(msg, "*")
		}
    } */
	
	function send_message(todo, extra, callback){
		if(callback){
			chrome.runtime.sendMessage({todo: todo, extra:extra}, function(response){
                callback(response)
		    })
		}
		else{
		    chrome.runtime.sendMessage({todo: todo, extra:extra})
		}
	}
	
	/* //未使用
	function get_main_content(){
		var win_width =window.innerWidth
		var win_height=window.innerHeight
		var all_node  =document.body.querySelectorAll("div, main, article")
		var node_is_dealed=[]
		var data=[]
		for(var i=0, l=all_node.length;i<l;i++){
			var node=all_node[i]
			//if(node_is_dealed.indexOf(node.parentNode) == -1){
				node_is_dealed.push(node.parentNode)
			    var style=getComputedStyle(node)
			    var rect=node.getBoundingClientRect()
			    if(rect.width>=400 && rect.height>0 && rect.width<=win_width*0.8){
					//if(node.querySelectorAll("input, textarea").length==0){
			    	    var obj={}
			    	        obj.width =rect.width
			    	        obj.height=rect.height
			    	        obj.el=node
			    	    data.push(obj)
					//}
			    }
			//}
		}
		
		data.sort((a, b)=>{
			return b.width*b.height-a.width*a.height
		})
		
		console.log(data[0].el)
		
		get_article_content(data[0].el)
	}
	//未使用
	function get_article_content(wrap_el){
		var all_node  =wrap_el.querySelectorAll("div, main, article")
		var node_is_dealed=[]
		var data=[]
		for(var i=0, l=all_node.length;i<l;i++){
			var node=all_node[i]
			//if(node_is_dealed.indexOf(node.parentNode) == -1){
				node_is_dealed.push(node.parentNode)
				var rect=node.getBoundingClientRect()
				var obj={}
			        obj.width =rect.width
			        obj.height=rect.height
			        obj.el=node
			    data.push(obj)
			//}
		}
		
		data.sort((a, b)=>{
			return b.width*b.height-a.width*a.height
		})
		
		data[0].el.style.boxShadow="5px 5px 2px rgba(0,0,0,.1)"
		
		var content_el=data[0].el.cloneNode(true)
		console.log(content_el)
		
		data[0].el.onclick=function(){
			//var node=data[0].el
			//    node.style.position="fixed"
			//    node.style.top="0px"
			//    node.style.left="0px"
			//    node.style.overflow="auto"
			//	
		    //if(!document.body.contains(article_el)){
			//	document.body.appendChild(article_el)
			//}
			
			content_el.querySelectorAll("*").forEach((el)=>{
				//携带所有样式：非必要数据太多
				//不携带样式  ：还原显示有很大问题，尤其是代码内容
				
				//var style=getComputedStyle(el)
				//var arr=[]
				//for(var key in style){
				//	if(!/^\d+$/.test(key)){
				//	    arr.push(key+":"+style[key])
				//	}
				//}
				//el.style.cssText=arr.join(";")
				
				var style=getComputedStyle(el)
				var attributeNames=el.getAttributeNames()
				if(style.display !== "none"){
				    for(var i=0, l=attributeNames.length;i<l;i++){
				    	if(["src", "href"].indexOf(attributeNames[i]) == -1){
				    	    el.removeAttribute(attributeNames[i])
				    	}
				    }
				}
				else{
					el.parentNode.removeChild(el)
				}
			})
			
		    send_message("keep_el", {"el_html":content_el.innerHTML.replace(/<!-- .+? -->/g, "")})
		}
	} */
}