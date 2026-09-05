document.onclick=function(e){
    if(e.clientX==window.innerWidth-1){
		if(e.clientY>=window.innerHeight*0.3){
			$("html,body").animate({scrollTop:0})
			//scroll_step(0)
		}
		else{
			$("html,body").animate({scrollTop:document.body.scrollHeight+"px"})
			//scroll_step(document.body.scrollHeight-wrap.win_height)
		}
	}
}

send_message_callback("get_el", "", function(c){
	console.log(c)
	var main=document.querySelector("#main")
	main.innerHTML=c.html
	/* main.querySelectorAll("img").forEach((el)=>{
		var tagName=el.tagName
		var parentNode=el.parentNode
		if(["IMG", "VIDEO", "IFRAME"].indexOf(tagName) !== -1){
		    var img_el=document.createElement(tagName)
		    img_el.src=el.src
		}
		
		parentNode.removeChild(el)
		parentNode.appendChild(img_el)
	}) */
})

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