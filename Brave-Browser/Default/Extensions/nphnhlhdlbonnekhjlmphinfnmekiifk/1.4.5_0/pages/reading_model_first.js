var data_arr_from = location.hash.replace(/^#/, "").split("_")
var is_dark       = data_arr_from[3]=="dark"
var bg_color      = is_dark?"#282c34":"#f6f6f6"
var html_el       = document.querySelector("html")


html_el.style.setProperty("--bg_color", bg_color)
html_el.style.setProperty("--article_bg_color", is_dark?"#2f5a90":"#fff")

html_el.style.setProperty("--title_bg_color", is_dark?"rgb(40 44 52 / 0.2)":"#f6f6f6")
html_el.style.setProperty("--text_color", is_dark?"#e4e4e4":"#222")
html_el.style.setProperty("--link_color", is_dark?"#79d5ff":"#03A9F4")
html_el.style.setProperty("--big_text_color", is_dark?"#fff":"#444")
html_el.style.setProperty("--top_icon_bg_color", is_dark?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.5)')

//html_el.style.setProperty("--transition", is_dark?"1000ms":"0ms")