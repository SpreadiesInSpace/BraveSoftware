$(document).ready(function(){
	var style=document.createElement("style")
	style.innerHTML="::-webkit-scrollbar{width:0px;height:2px}"	
	//document.head.appendChild(style)
	
	if(window.self==window.top){ //解决存在iframe的问题
	    var path_name  = (location.hostname+location.pathname).replace(/\.|\//g, "_")
	    var mark_point = []
	    var point_idx  = 0
		
		var keyCode_arr= [17]
		//var keyCode_arr= [17,37,39] //！左右键同时作用于编辑框
		var other_key_press = "no"
		var function_key_now= []
		
	    var div0    = document.createElement('div')
	    var div1    = document.createElement('div')
		var div_jindu=document.createElement('div')
		
	    div0.className         = "my_noscrollbar"
	    div1.className         = "my_noscrollbar"
	    div_jindu.className    = "my_noscrollbar_jindu"
		
	    div0.style.top="0"
	    div1.style.top="30vh"
	    div0.style.height="30vh"
	    div1.style.height="70vh"
		div0.style.background="#3A89C9"
	    div1.style.background="#FC354C"
		
		//init mark_point
		send_message("get_mark_point", path_name)
		
		document.onclick=function(e){ // 点击 popup 也会触发，触发时坐标(0,0)
		    if(e.clientX==window.innerWidth-1){
				if(e.clientY>=window.innerHeight*0.3){
					$("html,body").animate({scrollTop:0})
				}
				else{
					$("html,body").animate({scrollTop:document.body.scrollHeight+"px"})
				}
			}
			
			if(e.clientX==0){
				if(e.clientY !== 0){
				    if(e.clientY>=window.innerHeight*0.5){
				    	var scrollTop=window.scrollY
						window.scrollTo(0, scrollTop+window.innerHeight)
				    }
				    else{
				    	var scrollTop=window.scrollY
						window.scrollTo(0, scrollTop-window.innerHeight)
				    }
				}
			}
		}
		//HELLO
		document.ondblclick=function(e){
			var target_dom=e.target
			var parent_dom=target_dom.parentNode
			if(e.clientX!==0 && e.clientX!== window.innerWidth-1){
	    	    mark()
			}
			
			while(parent_dom.parentNode !== document.body){
				parent_dom=parent_dom.parentNode
			}
			console.log(parent_dom)
			
			var all_dom=parent_dom.querySelectorAll("*")
			for(var i=0;i<all_dom.length;i++){
				var the_dom=all_dom[i]
				if(the_dom.getBoundingClientRect().top>0){
				    if(getComputedStyle(the_dom).position !== "fixed"){
					    if(the_dom.innerText.replace(/\s/g, "").length>0){
					        console.log(the_dom)
					        console.log(the_dom.innerText.replace(/^\s+/, "").split(/\n/)[0])
					        break
					    }
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
	    	if(function_key_now.length==1){  //确保只有一个键被按下
	    	    if(function_key_now[0]==17){ //Crtl
	    		    if(mark_point.length>0){
	    		    	document.body.style.transition="0ms"
	    		    	window.scrollTo(0, mark_point[point_idx].value)
	    		    	if(point_idx<mark_point.length-1){
	    		    	    point_idx+=1
	    		    	}
	    		    	else{
	    		    		point_idx=0
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
				function_key_now.length=0
	    	}
			else{
				function_key_now.length=0
			}
	    }
		
	    document.addEventListener("visibilitychange", function(){
            if(!document.hidden){ //显示
	    		if(mark_point.length>0){
	    			send_message("changeBadgeText", mark_point.length)
	    		}
            }
        })

		window.onscroll=function(e){
			var scroll_top=window.scrollY
			var scrollHeight=document.body.scrollHeight-window.innerHeight
			if(!document.querySelector(".my_noscrollbar_jindu")){
				document.body.appendChild(div_jindu)
			}
			div_jindu.style.width=scroll_top/scrollHeight*100+"vw"
		}
		
		function mark(){
	    	var scroll_top=window.scrollY
	    	if(mark_point.length>0){
				var value_arr=[]
				mark_point.forEach(function(item){
					value_arr.push(item.value)
				})
				
	    		if(value_arr.indexOf(scroll_top)== -1){//去重
	    		    mark_point.push({"value":scroll_top, "note":""})
					mark_point.sort(function(a, b){
						return a.value - b.value
					})
					send_message("set_mark_point", {"path_name":path_name, "mark_point":mark_point})
	    		}
	    	}
	    	else{
	    		mark_point.push({"value":scroll_top, "note":""})
	    		send_message("set_mark_point", {"path_name":path_name, "mark_point":mark_point})
	    	}
			
			send_message("changeBadgeText", mark_point.length)
	    }
		
	    function send_message(todo, extra, callback){
	    	chrome.runtime.sendMessage({todo: todo, extra:(extra!==""?extra:"")}, function(response){
				if(callback){
                    callback(response)
				}
	    	})
	    }
	
	    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
	    	if(message.todo=="show_scrollbar"){
	    		if(window.self==window.top){
	    		    if(!document.querySelector(".my_noscrollbar")){
	    		        document.body.appendChild(div0)
	                    document.body.appendChild(div1)				    
	    		    	setTimeout(function(){
	        	        	document.body.removeChild(div0)
	                        document.body.removeChild(div1)
	        	        },8000)
	    		    }
	    		}
	    	}
			
			if(message.todo=="get_path_name"){
	    		sendResponse(path_name)
	    	}
			
			if(message.todo=="sync_mark_point"){
	    		mark_point=message.extra
	    	}
			
			if(message.todo=="to_point"){
	    		window.scrollTo(0, message.extra)
	    	}
	    	
	    	if(message.todo=="clear_mark_point"){
	    		
	    	}
	    })
	}
})