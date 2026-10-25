// Coordinates and brush width are fractions of image dimensions, independent of screen size.
export function paintInk(ctx,rects,strokes,width,height){
 if(!ctx)return;
 ctx.clearRect(0,0,width,height);ctx.save();ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.fillStyle='#214e42';
 for(const r of rects)ctx.fillRect(r.x*width,r.y*height,r.w*width,r.h*height);
 for(const stroke of strokes){
  ctx.globalCompositeOperation=stroke.tool==='erase'?'destination-out':'source-over';ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width*width;ctx.lineCap=ctx.lineJoin='round';ctx.shadowColor=stroke.color;ctx.shadowBlur=ctx.lineWidth*.35;
  ctx.beginPath();const [first,...rest]=stroke.points;if(!first)continue;
  if(!rest.length){ctx.arc(first[0]*width,first[1]*height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
  else{ctx.moveTo(first[0]*width,first[1]*height);for(const p of rest)ctx.lineTo(p[0]*width,p[1]*height);ctx.stroke();}
 }
 ctx.restore();
}
export function imageQueue(entries,field){return entries.flatMap(entry=>(entry.media?.[field]||[]).map(file=>({entry,file})));}
