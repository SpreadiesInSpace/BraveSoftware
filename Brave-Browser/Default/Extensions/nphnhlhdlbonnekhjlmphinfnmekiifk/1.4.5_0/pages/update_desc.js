    var language=chrome.i18n.getMessage("lang")
	var zh_text=document.querySelector(".zh")
	var en_text=document.querySelector(".en")
	//var for_chrome=document.querySelector(".for_chrome")
	var app_imgs=document.querySelectorAll(".app_img")
	var canvas=document.querySelector("canvas")
	    canvas.width =window.innerWidth*2
	    canvas.height=window.innerHeight*2
	var ctx=canvas.getContext("2d")
	
	/* get_browser((browser)=>{
		if(browser=="chrome"){
			for_chrome.style.display="block"
		}
	}) */
	
	if(language=="zh_cn"){
		zh_text.style.display="block"
	}
	else{
		en_text.style.display="block"
	}
	
	app_imgs.forEach((img)=>{
		img.onclick=()=>{
	        window.open(this.src)
	    }
	})
	
	for(var i=0;i<12;i++){
		var x0=parseInt(i<6?(canvas.width*0.245-8)*Math.random():canvas.width*0.755+(canvas.width*0.245-8)*Math.random())
		var y0=parseInt((canvas.height-20)*Math.random())
		
	    var path=new Path2D()
	        path.moveTo(x0, y0)
	        path.lineTo(x0+16, y0+16)
	        path.lineTo(x0, y0+32)
	        path.lineTo(x0-16, y0+16)
	        path.closePath()
		
		ctx.beginPath()
		ctx.fillStyle = "#fff"
        ctx.fill(path)
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
	