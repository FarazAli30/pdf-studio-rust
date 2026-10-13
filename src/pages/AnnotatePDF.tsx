import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { Highlighter, Trash2, Check, Undo2, Redo2, MousePointer2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }
function uid() { return Math.random().toString(36).slice(2,10); }

type AnnotType = "highlight"|"underline"|"strikeout"|"note";
const TYPE_COLORS: Record<AnnotType,string> = { highlight:"#FFFF00",underline:"#0000FF",strikeout:"#FF0000",note:"#FF9900" };

interface Ann {
  annotationId: string; type: AnnotType; pageIndex: number;
  rects: number[][]; quadPoints: number[];
  color: string; opacity: number; author: string;
  createdAt: string; modifiedAt: string;
  comment: string; selectedText: string;
  normalizedCoordinates: {x:number;y:number;w:number;h:number}[];
  viewportScale: number; rotation: number;
}

// ── geometry ──────────────────────────────────────────────────────────────────
const HS = 10;
const HANDLES = ["TL","TM","TR","ML","MR","BL","BM","BR"] as const;
type Handle = typeof HANDLES[number];

function hPos(b:{x:number;y:number;width:number;height:number}, h:Handle):[number,number] {
  const {x,y,width:w,height:hh}=b;
  const m:Record<Handle,[number,number]>={TL:[x,y],TM:[x+w/2,y],TR:[x+w,y],ML:[x,y+hh/2],MR:[x+w,y+hh/2],BL:[x,y+hh],BM:[x+w/2,y+hh],BR:[x+w,y+hh]};
  return m[h];
}
function hitHandle(b:{x:number;y:number;width:number;height:number},px:number,py:number):Handle|null {
  for(const h of HANDLES){const[hx,hy]=hPos(b,h);if(Math.abs(px-hx)<=HS+2&&Math.abs(py-hy)<=HS+2)return h;}
  return null;
}
function hitBox(b:{x:number;y:number;width:number;height:number},px:number,py:number){
  return px>=b.x&&px<=b.x+b.width&&py>=b.y&&py<=b.y+b.height;
}
function applyResize(orig:{x:number;y:number;w:number;h:number},handle:Handle,dx:number,dy:number){
  let{x,y,w,h}=orig;
  if(handle.includes("L")){x+=dx;w-=dx;}if(handle.includes("R")){w+=dx;}
  if(handle.includes("T")){y+=dy;h-=dy;}if(handle.includes("B")){h+=dy;}
  return{x,y,w:Math.max(8,w),h:Math.max(8,h)};
}
function handleCursor(h:Handle|null):string {
  if(!h)return"move";
  const m:Partial<Record<Handle,string>>={TL:"nwse-resize",BR:"nwse-resize",TR:"nesw-resize",BL:"nesw-resize",TM:"ns-resize",BM:"ns-resize",ML:"ew-resize",MR:"ew-resize"};
  return m[h]||"pointer";
}

// get bounding rect of annotation rects
function annBounds(a:Ann):{x:number;y:number;width:number;height:number} {
  const xs=a.rects.flatMap(r=>[r[0],r[0]+r[2]]);
  const ys=a.rects.flatMap(r=>[r[1],r[1]+r[3]]);
  const x=Math.min(...xs),y=Math.min(...ys);
  return{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}

export default function AnnotatePDF() {
  const [file, setFile] = useState<File|null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [anns, setAnns] = useState<Ann[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [tool, setTool] = useState<"select"|"draw">("draw");
  const [type, setType] = useState<AnnotType>("highlight");
  const [color, setColor] = useState("#FFFF00");
  const [opacity, setOpacity] = useState([0.5]);
  const [author, setAuthor] = useState("User");
  const [comment, setComment] = useState("");
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array|null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [, forceUpdate] = useState(0);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef  = useRef<pdfjs.PDFDocumentProxy|null>(null);
  const vpRef      = useRef({scale:1.5,width:0,height:0,rotation:0});
  const annsRef    = useRef<Ann[]>([]); annsRef.current = anns;
  const selIdRef   = useRef<string|null>(null); selIdRef.current = selectedId;
  const colorRef   = useRef(color); colorRef.current = color;
  const opacRef    = useRef(opacity); opacRef.current = opacity;
  const typeRef    = useRef(type); typeRef.current = type;
  const authorRef  = useRef(author); authorRef.current = author;
  const commentRef = useRef(comment); commentRef.current = comment;
  const toolRef    = useRef(tool); toolRef.current = tool;
  const curPageRef = useRef(currentPage); curPageRef.current = currentPage;
  const histRef    = useRef<Ann[][]>([]);
  const futureRef  = useRef<Ann[][]>([]);

  type IMode = "idle"|"drawing"|"moving"|"resizing"|"2finger";
  const iRef = useRef<{mode:IMode;startX:number;startY:number;endX:number;endY:number;dragOffX:number;dragOffY:number;handle:Handle|null;origAnn:Ann|null}>
    ({mode:"idle",startX:0,startY:0,endX:0,endY:0,dragOffX:0,dragOffY:0,handle:null,origAnn:null});

  const { addRecent } = useRecent();

  // ── canvas drawing ─────────────────────────────────────────────────────────
  const drawAnn = useCallback((ctx:CanvasRenderingContext2D, a:Ann, x:number, y:number, w:number, h:number, isSel:boolean) => {
    const [r,g,b] = a.color.match(/\w\w/g)!.map(v=>parseInt(v,16));
    ctx.strokeStyle=`rgb(${r},${g},${b})`; ctx.fillStyle=`rgba(${r},${g},${b},${a.opacity})`;
    if(a.type==="highlight"){ ctx.fillRect(x,y,w,h); }
    else if(a.type==="underline"){ ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+w,y+h);ctx.stroke(); }
    else if(a.type==="strikeout"){ ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);ctx.stroke(); }
    else{ ctx.globalAlpha=0.85;ctx.beginPath();ctx.arc(x+9,y+9,9,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1; }

    if(isSel){
      ctx.strokeStyle="#3b82f6"; ctx.lineWidth=2; ctx.setLineDash([5,3]);
      ctx.strokeRect(x-2,y-2,w+4,h+4); ctx.setLineDash([]);
      HANDLES.forEach(handle=>{
        const[hx,hy]=hPos({x,y,width:w,height:h},handle);
        ctx.fillStyle="#fff"; ctx.fillRect(hx-HS/2,hy-HS/2,HS,HS);
        ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.5; ctx.strokeRect(hx-HS/2,hy-HS/2,HS,HS);
      });
    }
  },[]);

  const redraw = useCallback((
    as=annsRef.current,
    selId=selIdRef.current,
    live?:{id:string;x:number;y:number;w:number;h:number}
  )=>{
    const oc=overlayRef.current; if(!oc)return;
    const ctx=oc.getContext("2d")!;
    ctx.clearRect(0,0,oc.width,oc.height);
    as.filter(a=>a.pageIndex===curPageRef.current).forEach(a=>{
      const b=annBounds(a);
      let x=b.x,y=b.y,w=b.width,h=b.height;
      if(live?.id===a.annotationId){x=live.x;y=live.y;w=live.w;h=live.h;}
      drawAnn(ctx,a,x,y,w,h,a.annotationId===selId);
    });
  },[drawAnn]);

  const drawPreview=useCallback((as:Ann[],selId:string|null,x1:number,y1:number,x2:number,y2:number)=>{
    redraw(as,selId);
    const oc=overlayRef.current; if(!oc)return;
    const ctx=oc.getContext("2d")!;
    const bx=Math.min(x1,x2),by=Math.min(y1,y2),bw=Math.abs(x2-x1),bh=Math.abs(y2-y1);
    if(bw<2||bh<2)return;
    const t=typeRef.current;
    const c=colorRef.current;
    const [r,g,b]=c.match(/\w\w/g)!.map(v=>parseInt(v,16));
    if(t==="highlight"){ctx.fillStyle=`rgba(${r},${g},${b},0.4)`;ctx.fillRect(bx,by,bw,bh);}
    else if(t==="underline"){ctx.strokeStyle=`rgba(${r},${g},${b},0.8)`;ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(bx,by+bh);ctx.lineTo(bx+bw,by+bh);ctx.stroke();}
    else if(t==="strikeout"){ctx.strokeStyle=`rgba(${r},${g},${b},0.8)`;ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(bx,by+bh/2);ctx.lineTo(bx+bw,by+bh/2);ctx.stroke();}
    else{ctx.fillStyle=`rgba(${r},${g},${b},0.8)`;ctx.beginPath();ctx.arc(bx+9,by+9,9,0,Math.PI*2);ctx.fill();}
    // selection outline
    ctx.strokeStyle="rgba(59,130,246,0.85)";ctx.lineWidth=1.5;ctx.setLineDash([6,3]);ctx.strokeRect(bx,by,bw,bh);ctx.setLineDash([]);
    [[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]].forEach(([hx,hy])=>{
      ctx.fillStyle="#3b82f6";ctx.fillRect(hx-HS/2,hy-HS/2,HS,HS);
    });
    const label=`${Math.round(bw)} × ${Math.round(bh)}`;
    const lx=bx,ly=by>22?by-6:by+bh+16;
    ctx.fillStyle="rgba(30,80,200,0.85)";ctx.beginPath();(ctx as any).roundRect?.(lx-1,ly-13,label.length*7+8,17,3);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 11px monospace";ctx.fillText(label,lx+3,ly);
  },[redraw]);

  useEffect(()=>{ redraw(); },[redraw,anns,selectedId,currentPage]);

  // ── page render ────────────────────────────────────────────────────────────
  const renderPage=useCallback(async(idx:number)=>{
    if(!pdfDocRef.current||!canvasRef.current)return;
    const page=await pdfDocRef.current.getPage(idx+1);
    const vp=page.getViewport({scale:1.5});
    vpRef.current={scale:vp.scale,width:vp.width,height:vp.height,rotation:vp.rotation};
    const c=canvasRef.current;c.width=vp.width;c.height=vp.height;
    if(overlayRef.current){overlayRef.current.width=vp.width;overlayRef.current.height=vp.height;}
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    redraw();
  },[redraw]);

  const handleFile=async(f:File)=>{
    setFile(f);setAnns([]);setSelectedId(null);histRef.current=[];futureRef.current=[];
    setIsSuccess(false);setError(null);setResultBytes(null);
    const doc=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
    pdfDocRef.current=doc;setPageCount(doc.numPages);setCurrentPage(0);
    await renderPage(0);
  };
  useEffect(()=>{if(pdfDocRef.current)renderPage(currentPage);},[currentPage,renderPage]);

  // ── undo/redo ──────────────────────────────────────────────────────────────
  const pushCommit=(prev:Ann[],next:Ann[])=>{
    histRef.current=[...histRef.current,prev];futureRef.current=[];
    setAnns(next);forceUpdate(n=>n+1);
  };
  const undo=useCallback(()=>{
    if(!histRef.current.length)return;
    const prev=histRef.current[histRef.current.length-1];
    futureRef.current=[annsRef.current,...futureRef.current];
    histRef.current=histRef.current.slice(0,-1);
    setAnns(prev);setSelectedId(null);forceUpdate(n=>n+1);
  },[]);
  const redo=useCallback(()=>{
    if(!futureRef.current.length)return;
    const next=futureRef.current[0];
    histRef.current=[...histRef.current,annsRef.current];
    futureRef.current=futureRef.current.slice(1);
    setAnns(next);setSelectedId(null);forceUpdate(n=>n+1);
  },[]);
  useEffect(()=>{
    const k=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();undo();}
      if((e.metaKey||e.ctrlKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))){e.preventDefault();redo();}
      if(e.key==="Escape"){setSelectedId(null);}
      if((e.key==="Delete"||e.key==="Backspace")&&selIdRef.current){
        pushCommit(annsRef.current,annsRef.current.filter(a=>a.annotationId!==selIdRef.current));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);
  },[undo,redo]);

  // ── coords / norm ──────────────────────────────────────────────────────────
  const toCanvas=(cx:number,cy:number)=>{
    const oc=overlayRef.current!;const r=oc.getBoundingClientRect();
    return{x:(cx-r.left)*(oc.width/r.width),y:(cy-r.top)*(oc.height/r.height)};
  };
  const makeNorm=(x:number,y:number,w:number,h:number)=>{
    const vp=vpRef.current;
    return[{x:x/vp.width,y:y/vp.height,w:w/vp.width,h:h/vp.height}];
  };
  const rebuildAnn=(a:Ann,x:number,y:number,w:number,h:number):Ann=>({
    ...a, rects:[[x,y,w,h]],
    quadPoints:[x,y,x+w,y,x,y+h,x+w,y+h],
    normalizedCoordinates:makeNorm(x,y,w,h),
    modifiedAt:new Date().toISOString(),
  });

  // ── interaction start ──────────────────────────────────────────────────────
  const interactStart=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const as=annsRef.current;
    const curPage=curPageRef.current;
    const selId=selIdRef.current;

    if(toolRef.current==="draw"){
      iRef.current={mode:"drawing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:null,origAnn:null};
      setSelectedId(null); return;
    }

    // handle on selected
    if(selId){
      const sa=as.find(a=>a.annotationId===selId);
      if(sa){
        const b=annBounds(sa);
        const h=hitHandle(b,p.x,p.y);
        if(h){iRef.current={mode:"resizing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:h,origAnn:sa};return;}
      }
    }

    // hit any ann
    const pageAnns=[...as.filter(a=>a.pageIndex===curPage)].reverse();
    const hit=pageAnns.find(a=>hitBox(annBounds(a),p.x,p.y));
    if(hit){
      const b=annBounds(hit);
      selIdRef.current=hit.annotationId;setSelectedId(hit.annotationId);
      iRef.current={mode:"moving",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:p.x-b.x,dragOffY:p.y-b.y,handle:null,origAnn:hit};
      redraw(as,hit.annotationId); return;
    }

    selIdRef.current=null;setSelectedId(null);
    iRef.current={mode:"drawing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:null,origAnn:null};
    redraw(as,null);
  };

  // ── interaction move ───────────────────────────────────────────────────────
  const interactMove=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const{mode,startX,startY,dragOffX,dragOffY,handle,origAnn}=iRef.current;
    iRef.current.endX=p.x;iRef.current.endY=p.y;

    if(mode==="drawing"){drawPreview(annsRef.current,null,startX,startY,p.x,p.y);return;}
    if(mode==="moving"&&origAnn){
      const nx=p.x-dragOffX,ny=p.y-dragOffY;
      const b=annBounds(origAnn);
      redraw(annsRef.current,selIdRef.current,{id:origAnn.annotationId,x:nx,y:ny,w:b.width,h:b.height});return;
    }
    if(mode==="resizing"&&origAnn&&handle){
      const b=annBounds(origAnn);
      const{x,y,w,h}=applyResize({x:b.x,y:b.y,w:b.width,h:b.height},handle,p.x-startX,p.y-startY);
      redraw(annsRef.current,selIdRef.current,{id:origAnn.annotationId,x,y,w,h});return;
    }
    if(mode==="idle"&&toolRef.current==="select"){
      const selId=selIdRef.current;
      if(selId){
        const sa=annsRef.current.find(a=>a.annotationId===selId);
        if(sa){
          const b=annBounds(sa);
          const h=hitHandle(b,p.x,p.y);
          if(h){setCursorStyle(handleCursor(h));return;}
          if(hitBox(b,p.x,p.y)){setCursorStyle("move");return;}
        }
      }
      const any=annsRef.current.filter(a=>a.pageIndex===curPageRef.current).some(a=>hitBox(annBounds(a),p.x,p.y));
      setCursorStyle(any?"move":"default");
    }
  };

  // ── interaction end ────────────────────────────────────────────────────────
  const interactEnd=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const{mode,startX,startY,dragOffX,dragOffY,handle,origAnn}=iRef.current;
    iRef.current.mode="idle";

    if(mode==="drawing"){
      const rx=Math.min(startX,p.x),ry=Math.min(startY,p.y),rw=Math.abs(p.x-startX),rh=Math.abs(p.y-startY);
      if(rw>6&&rh>6){
        const vp=vpRef.current;
        const na:Ann={
          annotationId:uid(),type:typeRef.current,pageIndex:curPageRef.current,
          rects:[[rx,ry,rw,rh]],quadPoints:[rx,ry,rx+rw,ry,rx,ry+rh,rx+rw,ry+rh],
          color:colorRef.current,opacity:opacRef.current[0],
          author:authorRef.current,createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),
          comment:commentRef.current,selectedText:window.getSelection()?.toString()||"",
          normalizedCoordinates:makeNorm(rx,ry,rw,rh),
          viewportScale:vp.scale,rotation:vp.rotation,
        };
        pushCommit(annsRef.current,[...annsRef.current,na]);
        selIdRef.current=na.annotationId;setSelectedId(na.annotationId);
      } else { redraw(); }
    }
    if(mode==="moving"&&origAnn){
      const nx=p.x-dragOffX,ny=p.y-dragOffY;
      const b=annBounds(origAnn);
      const updated=annsRef.current.map(a=>a.annotationId!==origAnn.annotationId?a:rebuildAnn(a,nx,ny,b.width,b.height));
      pushCommit(annsRef.current,updated);
    }
    if(mode==="resizing"&&origAnn&&handle){
      const b=annBounds(origAnn);
      const{x,y,w,h}=applyResize({x:b.x,y:b.y,w:b.width,h:b.height},handle,p.x-startX,p.y-startY);
      const updated=annsRef.current.map(a=>a.annotationId!==origAnn.annotationId?a:rebuildAnn(a,x,y,w,h));
      pushCommit(annsRef.current,updated);
    }
  };

  // ── mouse ──────────────────────────────────────────────────────────────────
  const onMouseDown=(e:React.MouseEvent<HTMLCanvasElement>)=>interactStart(e.clientX,e.clientY);
  const onMouseMove=(e:React.MouseEvent<HTMLCanvasElement>)=>interactMove(e.clientX,e.clientY);
  const onMouseUp  =(e:React.MouseEvent<HTMLCanvasElement>)=>interactEnd(e.clientX,e.clientY);
  const onMouseLeave=()=>{ if(iRef.current.mode!=="idle"){iRef.current.mode="idle";redraw();} };

  // ── touch ──────────────────────────────────────────────────────────────────
  const onTouchStart=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(e.touches.length===1){interactStart(e.touches[0].clientX,e.touches[0].clientY);}
    else if(e.touches.length===2){
      const p0=toCanvas(e.touches[0].clientX,e.touches[0].clientY);
      const p1=toCanvas(e.touches[1].clientX,e.touches[1].clientY);
      iRef.current={mode:"2finger",startX:p0.x,startY:p0.y,endX:p1.x,endY:p1.y,dragOffX:0,dragOffY:0,handle:null,origAnn:null};
      drawPreview(annsRef.current,null,p0.x,p0.y,p1.x,p1.y);
    }
  };
  const onTouchMove=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(e.touches.length===2&&iRef.current.mode==="2finger"){
      const p0=toCanvas(e.touches[0].clientX,e.touches[0].clientY);
      const p1=toCanvas(e.touches[1].clientX,e.touches[1].clientY);
      iRef.current.endX=p1.x;iRef.current.endY=p1.y;
      drawPreview(annsRef.current,null,p0.x,p0.y,p1.x,p1.y);
    } else if(e.touches.length===1){interactMove(e.touches[0].clientX,e.touches[0].clientY);}
  };
  const onTouchEnd=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(iRef.current.mode==="2finger"){
      const{startX,startY,endX,endY}=iRef.current;
      iRef.current.mode="idle";
      const rx=Math.min(startX,endX),ry=Math.min(startY,endY),rw=Math.abs(endX-startX),rh=Math.abs(endY-startY);
      if(rw>6&&rh>6){
        const vp=vpRef.current;
        const na:Ann={
          annotationId:uid(),type:typeRef.current,pageIndex:curPageRef.current,
          rects:[[rx,ry,rw,rh]],quadPoints:[rx,ry,rx+rw,ry,rx,ry+rh,rx+rw,ry+rh],
          color:colorRef.current,opacity:opacRef.current[0],
          author:authorRef.current,createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),
          comment:commentRef.current,selectedText:"",
          normalizedCoordinates:makeNorm(rx,ry,rw,rh),viewportScale:vp.scale,rotation:vp.rotation,
        };
        pushCommit(annsRef.current,[...annsRef.current,na]);
        selIdRef.current=na.annotationId;setSelectedId(na.annotationId);
      } else { redraw(); }
    } else if(e.changedTouches.length===1){interactEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY);}
  };

  // ── embed ──────────────────────────────────────────────────────────────────
  const embedAnnotations=async()=>{
    if(!file||!anns.length)return;
    setIsProcessing(true);setError(null);
    try{
      const doc=await PDFDocument.load(await file.arrayBuffer());
      for(const a of anns){
        const page=doc.getPage(a.pageIndex);
        const{width:pw,height:ph}=page.getSize();
        const vp=vpRef.current;
        const[cr,cg,cb]=a.color.match(/\w\w/g)!.map(v=>parseInt(v,16)/255);
        for(const[rx,ry,rw,rh] of a.rects){
          const nc={x:rx/vp.width,y:ry/vp.height,w:rw/vp.width,h:rh/vp.height};
          const x=nc.x*pw,pdfY=ph-nc.y*ph-nc.h*ph,w=nc.w*pw,h=nc.h*ph;
          if(a.type==="highlight")page.drawRectangle({x,y:pdfY,width:w,height:h,color:rgb(cr,cg,cb),opacity:a.opacity});
          else if(a.type==="underline")page.drawLine({start:{x,y:pdfY},end:{x:x+w,y:pdfY},thickness:2,color:rgb(cr,cg,cb),opacity:a.opacity});
          else if(a.type==="strikeout")page.drawLine({start:{x,y:pdfY+h/2},end:{x:x+w,y:pdfY+h/2},thickness:2,color:rgb(cr,cg,cb),opacity:a.opacity});
          else page.drawCircle({x:x+9,y:pdfY+9,size:9,color:rgb(cr,cg,cb),opacity:0.85});
        }
      }
      const result=await doc.save();
      setResultBytes(result);setOutputSize(result.byteLength);setIsSuccess(true);
      addRecent({name:file.name,tool:"Annotate PDF",toolPath:"/annotate-pdf",size:file.size});
    }catch(err:unknown){setError((err as Error).message||"Annotation failed");}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setAnns([]);setSelectedId(null);setPageCount(0);setCurrentPage(0);setIsSuccess(false);setError(null);setResultBytes(null);pdfDocRef.current=null;histRef.current=[];futureRef.current=[];};

  const selectedAnn=anns.find(a=>a.annotationId===selectedId&&a.pageIndex===currentPage);
  const selBounds=selectedAnn?annBounds(selectedAnn):null;
  const canUndo=histRef.current.length>0, canRedo=futureRef.current.length>0;
  const dynamicCursor=tool==="draw"?"crosshair":cursorStyle;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center"><Highlighter className="w-5 h-5 text-yellow-600"/></div>
          <h1 className="text-2xl font-bold">Annotate PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Draw annotations. Click any annotation to select, move, or resize it.</p>
        <div className="space-y-4">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Embedding annotations..." outputSize={outputSize} downloadLabel="Download Annotated PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`annotated-${file?.name||"output.pdf"}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>

          {file && !isProcessing && !isSuccess && !error && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-2 items-center bg-card border border-border rounded-2xl p-3">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button onClick={()=>setTool("select")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${tool==="select"?"bg-primary text-primary-foreground":"hover:bg-accent"}`}>
                    <MousePointer2 className="w-3.5 h-3.5"/>Select
                  </button>
                  <button onClick={()=>setTool("draw")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${tool==="draw"?"bg-primary text-primary-foreground":"hover:bg-accent"}`}>
                    <Pencil className="w-3.5 h-3.5"/>Draw
                  </button>
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {(["highlight","underline","strikeout","note"] as AnnotType[]).map((t,i)=>(
                    <button key={t} onClick={()=>{setType(t);setColor(TYPE_COLORS[t]);}}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors capitalize ${i>0?"border-l border-border":""} ${type===t?"bg-primary text-primary-foreground":"hover:bg-accent"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-border"/>
                </div>
                <div className="flex items-center gap-2 w-28">
                  <Slider value={opacity} onValueChange={setOpacity} min={0.1} max={1} step={0.05} className="flex-1"/>
                  <span className="text-xs w-7 text-muted-foreground">{Math.round(opacity[0]*100)}%</span>
                </div>
                {pageCount>1&&(
                  <Select value={String(currentPage)} onValueChange={v=>setCurrentPage(Number(v))}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue/></SelectTrigger>
                    <SelectContent>{Array.from({length:pageCount},(_,i)=><SelectItem key={i} value={String(i)}>Page {i+1}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} className="w-7 h-7" title="Undo"><Undo2 className="w-3.5 h-3.5"/></Button>
                  <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} className="w-7 h-7" title="Redo"><Redo2 className="w-3.5 h-3.5"/></Button>
                </div>
              </div>

              {/* Canvas */}
              <div className="relative border border-border rounded-xl overflow-hidden bg-accent/20 select-none" style={{cursor:dynamicCursor}}>
                <canvas ref={canvasRef} className="block w-full"/>
                <canvas ref={overlayRef} className="absolute inset-0 w-full h-full"
                  style={{mixBlendMode:"multiply",touchAction:"none"}}
                  onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
                  onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}/>
              </div>

              {/* Selected annotation editor */}
              {selectedAnn&&selBounds&&(
                <div className="bg-card border-2 border-primary/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-primary capitalize">Edit {selectedAnn.type}</p>
                    <Button size="sm" variant="ghost" onClick={()=>{pushCommit(annsRef.current,annsRef.current.filter(a=>a.annotationId!==selectedId));setSelectedId(null);}} className="gap-1 text-destructive hover:text-destructive h-7 text-xs">
                      <Trash2 className="w-3 h-3"/>Delete
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ["X",Math.round(selBounds.x),(v:number)=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:rebuildAnn(a,v,selBounds.y,selBounds.width,selBounds.height)))],
                      ["Y",Math.round(selBounds.y),(v:number)=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:rebuildAnn(a,selBounds.x,v,selBounds.width,selBounds.height)))],
                      ["W",Math.round(selBounds.width),(v:number)=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:rebuildAnn(a,selBounds.x,selBounds.y,Math.max(8,v),selBounds.height)))],
                      ["H",Math.round(selBounds.height),(v:number)=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:rebuildAnn(a,selBounds.x,selBounds.y,selBounds.width,Math.max(8,v))))],
                    ] as [string,number,(v:number)=>void][]).map(([lbl,val,onChange])=>(
                      <div key={lbl}>
                        <Label className="text-xs text-muted-foreground">{lbl} (px)</Label>
                        <Input type="number" value={val} onChange={e=>onChange(Number(e.target.value))} className="h-8 text-xs mt-1"/>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Color</Label>
                      <input type="color" value={selectedAnn.color} onChange={e=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:{...a,color:e.target.value,modifiedAt:new Date().toISOString()}))} className="w-7 h-7 rounded border border-border cursor-pointer"/>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Type</Label>
                      <Select value={selectedAnn.type} onValueChange={v=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:{...a,type:v as AnnotType,color:TYPE_COLORS[v as AnnotType],modifiedAt:new Date().toISOString()}))}>
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue/></SelectTrigger>
                        <SelectContent>{(["highlight","underline","strikeout","note"] as AnnotType[]).map(t=><SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Comment</Label>
                    <Textarea value={selectedAnn.comment} onChange={e=>pushCommit(annsRef.current,annsRef.current.map(a=>a.annotationId!==selectedId?a:{...a,comment:e.target.value,modifiedAt:new Date().toISOString()}))} className="mt-1 text-xs resize-none" rows={2} placeholder="Add a note..."/>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {tool==="draw"?"Draw mode: drag to annotate · switch to Select to edit":"Select mode: click to select · drag to move · drag handles to resize · Delete key removes"}
              </p>

              {anns.length>0&&(
                <Button onClick={embedAnnotations} className="w-full gap-2">
                  <Check className="w-4 h-4"/>Embed {anns.length} Annotation{anns.length>1?"s":""}
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
