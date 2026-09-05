var scroll_bar   = document.querySelector(".scroll_bar")
var sb_block_out = scroll_bar.querySelector(".sb_block_out")
var sb_block     = scroll_bar.querySelector(".sb_block")
var new_year     = scroll_bar.querySelector(".new_year")

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

//新年彩蛋
var date =new Date()
var year =date.getFullYear()
var month=date.getMonth()
var day  =date.getDate()
var date_text=year+"-"+(month+1)+"-"+day
if(date_text=="2021-1-1"){
	new_year.style.display="flex"
}


window.addEventListener("message", function(e){
	var msg_obj = e.data
	var todo    = msg_obj.todo
	
	if(todo=="set_scrollbar_data"){
		//alert(msg_obj.data.y)
		is_use_side_click=msg_obj.data.is_use_side_click
		num_screen=msg_obj.data.num_screen
		sb_block_h=msg_obj.data.h
		sb_block_y=msg_obj.data.y
		
		document.body.style.setProperty("--sb_block_opacity", sb_block_h==msg_obj.data.win_h?"0":"0.8")
		sb_block.style.height=sb_block_h+"px"
		sb_block.style.transition="0ms"
		sb_block.style.transform="translate3d(0, "+sb_block_y+"px, 0)"
	}
	
	else if(todo=="start_auto_scrolling"){
		sb_block.style.transition="300ms linear"
	    sb_block.style.transform="translate3d(0, "+sb_block_y+"px, 0)"
	}
	
	else if(todo=="end_move"){
		is_can_move=false
	    is_moved=false
	}
})

postMessage_to_main_window("scroll_bar_is_ready", {})


function to_scroll(client_y){
	var sb_block_height=getComputedStyle(sb_block).height.replace("px", "")
	
	is_moved=true
	sb_block_y=client_y
	sb_block_y=Math.max(sb_block_y, 0)
	sb_block_y=Math.min(window.innerHeight-sb_block_height, sb_block_y)
	
	sb_block.style.transition="0ms"
	sb_block.style.transform="translate3d(0, "+sb_block_y+"px, 0)"
	
	postMessage_to_main_window("scroll_main_page", {"h":sb_block_height, "y":sb_block_y})
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
	
	postMessage_to_main_window("scroll_to_top_or_bottom", {"fx":fx})
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