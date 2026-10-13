import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { EyeOff, Trash2, Check, Undo2, Redo2, MousePointer2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useRecent } from "@/contexts/RecentContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }
function uid() { return Math.random().toString(36).slice(2,10); }

interface RBox {
  id: string; pageIndex: number;
  x: number; y: number; width: number; height: number;
  color: string; opacity: number; redactMode: boolean; permanent: boolean;
  normalizedCoordinates: { x:number; y:number; w:number; h:number };
  viewportScale: number; rotation: number;
}

// ── geometry helpers ──────────────────────────────────────────────────────────
const HS = 10; // handle half-size
const HANDLES = ["TL","TM","TR","ML","MR","BL","BM","BR"] as const;
type Handle = typeof HANDLES[number];

function hPos(b: {x:number;y:number;width:number;height:number}, h: Handle): [number,number] {
  const {x,y,width:w,height:hh} = b;
  const m: Record<Handle,[number,number]> = {
    TL:[x,y],TM:[x+w/2,y],TR:[x+w,y],ML:[x,y+hh/2],
    MR:[x+w,y+hh/2],BL:[x,y+hh],BM:[x+w/2,y+hh],BR:[x+w,y+hh],
  };
  return m[h];
}
function hitHandle(b: {x:number;y:number;width:number;height:number}, px:number, py:number): Handle|null {
  for (const h of HANDLES) { const [hx,hy]=hPos(b,h); if(Math.abs(px-hx)<=HS+2&&Math.abs(py-hy)<=HS+2) return h; }
  return null;
}
function hitBox(b: {x:number;y:number;width:number;height:number}, px:number, py:number) {
  return px>=b.x&&px<=b.x+b.width&&py>=b.y&&py<=b.y+b.height;
}
function applyResize(orig: {x:number;y:number;w:number;h:number}, handle: Handle, dx:number, dy:number) {
  let {x,y,w,h} = orig;
  if(handle.includes("L")){x+=dx;w-=dx;} if(handle.includes("R")){w+=dx;}
  if(handle.includes("T")){y+=dy;h-=dy;} if(handle.includes("B")){h+=dy;}
  return {x,y,w:Math.max(8,w),h:Math.max(8,h)};
}
function handleCursor(h: Handle|null): string {
  if(!h) return "move";
  const m: Partial<Record<Handle,string>> = {TL:"nwse-resize",BR:"nwse-resize",TR:"nesw-resize",BL:"nesw-resize",TM:"ns-resize",BM:"ns-resize",ML:"ew-resize",MR:"ew-resize"};
  return m[h]||"pointer";
}

export default function RedactPDF() {
  const [file, setFile] = useState<File|null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [boxes, setBoxes] = useState<RBox[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [tool, setTool] = useState<"select"|"draw">("draw");
  const [color, setColor] = useState("#000000");
  const [redactMode, setRedactMode] = useState(true);
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array|null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [, forceUpdate] = useState(0);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const vpRef      = useRef({scale:1,width:0,height:0,rotation:0});
  const pdfDocRef  = useRef<pdfjs.PDFDocumentProxy|null>(null);
  const boxesRef   = useRef<RBox[]>([]);  boxesRef.current = boxes;
  const selIdRef   = useRef<string|null>(null); selIdRef.current = selectedId;
  const colorRef   = useRef(color);  colorRef.current = color;
  const toolRef    = useRef(tool);   toolRef.current = tool;
  const redactRef  = useRef(redactMode); redactRef.current = redactMode;
  const histRef    = useRef<RBox[][]>([]);
  const futureRef  = useRef<RBox[][]>([]);
  const curPageRef = useRef(currentPage); curPageRef.current = currentPage;

  // interaction state machine
  type IMode = "idle"|"drawing"|"moving"|"resizing"|"2finger";
  const iRef = useRef<{
    mode: IMode; startX:number; startY:number;
    endX:number; endY:number;
    dragOffX:number; dragOffY:number;
    handle: Handle|null; origBox: RBox|null;
  }>({mode:"idle",startX:0,startY:0,endX:0,endY:0,dragOffX:0,dragOffY:0,handle:null,origBox:null});

  const { addRecent } = useRecent();

  // ── draw ──────────────────────────────────────────────────────────────────
  const redraw = useCallback((
    bxs = boxesRef.current,
    selId = selIdRef.current,
    live?: {id:string;x:number;y:number;w:number;h:number}
  ) => {
    const oc = overlayRef.current; if(!oc) return;
    const ctx = oc.getContext("2d")!;
    ctx.clearRect(0,0,oc.width,oc.height);
    bxs.filter(b=>b.pageIndex===curPageRef.current).forEach(b => {
      let {x,y,width:w,height:h} = b;
      if(live?.id===b.id){x=live.x;y=live.y;w=live.w;h=live.h;}
      ctx.fillStyle=b.color; ctx.globalAlpha=b.opacity;
      ctx.fillRect(x,y,w,h); ctx.globalAlpha=1;
      if(b.id===selId){
        ctx.strokeStyle="#3b82f6"; ctx.lineWidth=2; ctx.setLineDash([5,3]);
        ctx.strokeRect(x-1,y-1,w+2,h+2); ctx.setLineDash([]);
        HANDLES.forEach(handle => {
          const [hx,hy]=hPos({x,y,width:w,height:h},handle);
          ctx.fillStyle="#fff"; ctx.fillRect(hx-HS/2,hy-HS/2,HS,HS);
          ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.5; ctx.strokeRect(hx-HS/2,hy-HS/2,HS,HS);
        });
      }
    });
  },[]);

  const drawDrawPreview = useCallback((bxs:RBox[],selId:string|null,x1:number,y1:number,x2:number,y2:number)=>{
    redraw(bxs,selId);
    const oc=overlayRef.current; if(!oc) return;
    const ctx=oc.getContext("2d")!;
    const bx=Math.min(x1,x2),by=Math.min(y1,y2),bw=Math.abs(x2-x1),bh=Math.abs(y2-y1);
    if(bw<2||bh<2) return;
    ctx.fillStyle=colorRef.current; ctx.globalAlpha=0.45; ctx.fillRect(bx,by,bw,bh); ctx.globalAlpha=1;
    ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=2.5; ctx.setLineDash([7,4]); ctx.strokeRect(bx+1,by+1,bw-2,bh-2);
    ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.lineWidth=1; ctx.setLineDash([]); ctx.strokeRect(bx,by,bw,bh);
    [[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]].forEach(([hx,hy])=>{
      ctx.fillStyle="#fff"; ctx.fillRect(hx-HS/2,hy-HS/2,HS,HS);
      ctx.strokeStyle="#333"; ctx.lineWidth=1.2; ctx.strokeRect(hx-HS/2,hy-HS/2,HS,HS);
    });
    const label=`${Math.round(bw)} × ${Math.round(bh)}`;
    const lx=bx, ly=by>22?by-6:by+bh+16;
    ctx.fillStyle="rgba(0,0,0,0.75)"; ctx.beginPath(); (ctx as any).roundRect?.(lx-1,ly-13,label.length*7+8,17,3); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="bold 11px monospace"; ctx.fillText(label,lx+3,ly);
  },[redraw]);

  useEffect(()=>{ redraw(); },[redraw,boxes,selectedId,currentPage]);

  // ── page render ───────────────────────────────────────────────────────────
  const renderPage = useCallback(async(idx:number)=>{
    if(!pdfDocRef.current||!canvasRef.current) return;
    const page=await pdfDocRef.current.getPage(idx+1);
    const vp=page.getViewport({scale:1.5});
    vpRef.current={scale:vp.scale,width:vp.width,height:vp.height,rotation:vp.rotation};
    const c=canvasRef.current; c.width=vp.width; c.height=vp.height;
    if(overlayRef.current){overlayRef.current.width=vp.width;overlayRef.current.height=vp.height;}
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    redraw();
  },[redraw]);

  const handleFile=async(f:File)=>{
    setFile(f);setBoxes([]);setSelectedId(null);histRef.current=[];futureRef.current=[];
    setIsSuccess(false);setError(null);setResultBytes(null);
    const doc=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
    pdfDocRef.current=doc;setPageCount(doc.numPages);setCurrentPage(0);
    await renderPage(0);
  };
  useEffect(()=>{if(pdfDocRef.current)renderPage(currentPage);},[currentPage,renderPage]);

  // ── undo/redo ─────────────────────────────────────────────────────────────
  const pushCommit=(prev:RBox[],next:RBox[])=>{
    histRef.current=[...histRef.current,prev];futureRef.current=[];
    setBoxes(next);forceUpdate(n=>n+1);
  };
  const undo=useCallback(()=>{
    if(!histRef.current.length)return;
    const prev=histRef.current[histRef.current.length-1];
    futureRef.current=[boxesRef.current,...futureRef.current];
    histRef.current=histRef.current.slice(0,-1);
    setBoxes(prev);setSelectedId(null);forceUpdate(n=>n+1);
  },[]);
  const redo=useCallback(()=>{
    if(!futureRef.current.length)return;
    const next=futureRef.current[0];
    histRef.current=[...histRef.current,boxesRef.current];
    futureRef.current=futureRef.current.slice(1);
    setBoxes(next);setSelectedId(null);forceUpdate(n=>n+1);
  },[]);
  useEffect(()=>{
    const k=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();undo();}
      if((e.metaKey||e.ctrlKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))){e.preventDefault();redo();}
      if(e.key==="Escape"){setSelectedId(null);}
      if((e.key==="Delete"||e.key==="Backspace")&&selIdRef.current){
        pushCommit(boxesRef.current,boxesRef.current.filter(b=>b.id!==selIdRef.current));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);
  },[undo,redo]);

  // ── coords ────────────────────────────────────────────────────────────────
  const toCanvas=(cx:number,cy:number)=>{
    const oc=overlayRef.current!;const r=oc.getBoundingClientRect();
    return {x:(cx-r.left)*(oc.width/r.width),y:(cy-r.top)*(oc.height/r.height)};
  };

  const updateNorm=(b:RBox,x:number,y:number,w:number,h:number):RBox=>{
    const vp=vpRef.current;
    return {...b,x,y,width:w,height:h,normalizedCoordinates:{x:x/vp.width,y:y/vp.height,w:w/vp.width,h:h/vp.height}};
  };

  // ── interaction start ─────────────────────────────────────────────────────
  const interactStart=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const bxs=boxesRef.current;
    const curPage=curPageRef.current;
    const selId=selIdRef.current;

    // 1. If in draw tool mode — always draw
    if(toolRef.current==="draw"){
      iRef.current={mode:"drawing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:null,origBox:null};
      setSelectedId(null);
      return;
    }

    // 2. Select tool: check handles of selected box first
    if(selId){
      const selBox=bxs.find(b=>b.id===selId);
      if(selBox){
        const h=hitHandle(selBox,p.x,p.y);
        if(h){
          iRef.current={mode:"resizing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:h,origBox:selBox};
          return;
        }
      }
    }

    // 3. Hit test boxes on this page (reverse = topmost first)
    const pageBxs=[...bxs.filter(b=>b.pageIndex===curPage)].reverse();
    const hit=pageBxs.find(b=>hitBox(b,p.x,p.y));
    if(hit){
      selIdRef.current=hit.id;setSelectedId(hit.id);
      iRef.current={mode:"moving",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:p.x-hit.x,dragOffY:p.y-hit.y,handle:null,origBox:hit};
      redraw(bxs,hit.id);
      return;
    }

    // 4. Empty area — deselect + start draw
    selIdRef.current=null;setSelectedId(null);
    iRef.current={mode:"drawing",startX:p.x,startY:p.y,endX:p.x,endY:p.y,dragOffX:0,dragOffY:0,handle:null,origBox:null};
    redraw(bxs,null);
  };

  // ── interaction move ──────────────────────────────────────────────────────
  const interactMove=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const {mode,startX,startY,dragOffX,dragOffY,handle,origBox}=iRef.current;
    iRef.current.endX=p.x;iRef.current.endY=p.y;

    if(mode==="drawing"){
      drawDrawPreview(boxesRef.current,null,startX,startY,p.x,p.y);
      return;
    }
    if(mode==="moving"&&origBox){
      const nx=p.x-dragOffX,ny=p.y-dragOffY;
      redraw(boxesRef.current,selIdRef.current,{id:origBox.id,x:nx,y:ny,w:origBox.width,h:origBox.height});
      return;
    }
    if(mode==="resizing"&&origBox&&handle){
      const dx=p.x-startX,dy=p.y-startY;
      const {x,y,w,h}=applyResize({x:origBox.x,y:origBox.y,w:origBox.width,h:origBox.height},handle,dx,dy);
      redraw(boxesRef.current,selIdRef.current,{id:origBox.id,x,y,w,h});
      return;
    }
    if(mode==="idle"&&toolRef.current==="select"){
      const selId=selIdRef.current;
      if(selId){
        const sb=boxesRef.current.find(b=>b.id===selId);
        if(sb){
          const h=hitHandle(sb,p.x,p.y);
          if(h){setCursorStyle(handleCursor(h));return;}
          if(hitBox(sb,p.x,p.y)){setCursorStyle("move");return;}
        }
      }
      const anyHit=boxesRef.current.filter(b=>b.pageIndex===curPageRef.current).some(b=>hitBox(b,p.x,p.y));
      setCursorStyle(anyHit?"move":"default");
    }
  };

  // ── interaction end ───────────────────────────────────────────────────────
  const interactEnd=(cx:number,cy:number)=>{
    const p=toCanvas(cx,cy);
    const {mode,startX,startY,dragOffX,dragOffY,handle,origBox}=iRef.current;
    iRef.current.mode="idle";

    if(mode==="drawing"){
      const bx=Math.min(startX,p.x),by=Math.min(startY,p.y);
      const bw=Math.abs(p.x-startX),bh=Math.abs(p.y-startY);
      if(bw>6&&bh>6){
        const vp=vpRef.current;
        const nb:RBox={
          id:uid(),pageIndex:curPageRef.current,x:bx,y:by,width:bw,height:bh,
          color:colorRef.current,opacity:1,redactMode:redactRef.current,permanent:true,
          normalizedCoordinates:{x:bx/vp.width,y:by/vp.height,w:bw/vp.width,h:bh/vp.height},
          viewportScale:vp.scale,rotation:vp.rotation,
        };
        pushCommit(boxesRef.current,[...boxesRef.current,nb]);
        selIdRef.current=nb.id;setSelectedId(nb.id);
      } else { redraw(); }
    }
    if(mode==="moving"&&origBox){
      const nx=p.x-dragOffX,ny=p.y-dragOffY;
      const updated=boxesRef.current.map(b=>b.id!==origBox.id?b:updateNorm(b,nx,ny,b.width,b.height));
      pushCommit(boxesRef.current,updated);
    }
    if(mode==="resizing"&&origBox&&handle){
      const dx=p.x-startX,dy=p.y-startY;
      const{x,y,w,h}=applyResize({x:origBox.x,y:origBox.y,w:origBox.width,h:origBox.height},handle,dx,dy);
      const updated=boxesRef.current.map(b=>b.id!==origBox.id?b:updateNorm(b,x,y,w,h));
      pushCommit(boxesRef.current,updated);
    }
  };

  // ── mouse events ──────────────────────────────────────────────────────────
  const onMouseDown=(e:React.MouseEvent<HTMLCanvasElement>)=>interactStart(e.clientX,e.clientY);
  const onMouseMove=(e:React.MouseEvent<HTMLCanvasElement>)=>interactMove(e.clientX,e.clientY);
  const onMouseUp  =(e:React.MouseEvent<HTMLCanvasElement>)=>interactEnd(e.clientX,e.clientY);
  const onMouseLeave=()=>{ if(iRef.current.mode!=="idle"){iRef.current.mode="idle";redraw();} };

  // ── touch events ──────────────────────────────────────────────────────────
  const onTouchStart=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(e.touches.length===1){ interactStart(e.touches[0].clientX,e.touches[0].clientY); }
    else if(e.touches.length===2){
      const p0=toCanvas(e.touches[0].clientX,e.touches[0].clientY);
      const p1=toCanvas(e.touches[1].clientX,e.touches[1].clientY);
      iRef.current={mode:"2finger",startX:p0.x,startY:p0.y,endX:p1.x,endY:p1.y,dragOffX:0,dragOffY:0,handle:null,origBox:null};
      drawDrawPreview(boxesRef.current,null,p0.x,p0.y,p1.x,p1.y);
    }
  };
  const onTouchMove=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(e.touches.length===2&&iRef.current.mode==="2finger"){
      const p0=toCanvas(e.touches[0].clientX,e.touches[0].clientY);
      const p1=toCanvas(e.touches[1].clientX,e.touches[1].clientY);
      iRef.current.endX=p1.x;iRef.current.endY=p1.y;
      drawDrawPreview(boxesRef.current,null,p0.x,p0.y,p1.x,p1.y);
    } else if(e.touches.length===1){ interactMove(e.touches[0].clientX,e.touches[0].clientY); }
  };
  const onTouchEnd=(e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();
    if(iRef.current.mode==="2finger"){
      const{startX,startY,endX,endY}=iRef.current;
      iRef.current.mode="idle";
      const bx=Math.min(startX,endX),by=Math.min(startY,endY);
      const bw=Math.abs(endX-startX),bh=Math.abs(endY-startY);
      if(bw>6&&bh>6){
        const vp=vpRef.current;
        const nb:RBox={
          id:uid(),pageIndex:curPageRef.current,x:bx,y:by,width:bw,height:bh,
          color:colorRef.current,opacity:1,redactMode:redactRef.current,permanent:true,
          normalizedCoordinates:{x:bx/vp.width,y:by/vp.height,w:bw/vp.width,h:bh/vp.height},
          viewportScale:vp.scale,rotation:vp.rotation,
        };
        pushCommit(boxesRef.current,[...boxesRef.current,nb]);
        selIdRef.current=nb.id;setSelectedId(nb.id);
      } else { redraw(); }
    } else if(e.changedTouches.length===1){ interactEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY); }
  };

  // ── apply ─────────────────────────────────────────────────────────────────
  const applyRedactions=async()=>{
    if(!file||!boxes.length)return;
    setIsProcessing(true);setError(null);
    try{
      const doc=await PDFDocument.load(await file.arrayBuffer());
      for(const box of boxes){
        const page=doc.getPage(box.pageIndex);
        const{width:pw,height:ph}=page.getSize();
        const{x:nx,y:ny,w:nw,h:nh}=box.normalizedCoordinates;
        const[r,g,b]=box.color.match(/\w\w/g)!.map(v=>parseInt(v,16)/255);
        page.drawRectangle({x:nx*pw,y:ph-ny*ph-nh*ph,width:nw*pw,height:nh*ph,color:rgb(r,g,b),opacity:1});
      }
      const result=await doc.save();
      setResultBytes(result);setOutputSize(result.byteLength);setIsSuccess(true);
      addRecent({name:file.name,tool:"Redact PDF",toolPath:"/redact-pdf",size:file.size});
    }catch(err:unknown){setError((err as Error).message||"Redaction failed");}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setBoxes([]);setSelectedId(null);setPageCount(0);setCurrentPage(0);setIsSuccess(false);setError(null);setResultBytes(null);pdfDocRef.current=null;histRef.current=[];futureRef.current=[];};

  const selectedBox=boxes.find(b=>b.id===selectedId&&b.pageIndex===currentPage);
  const canUndo=histRef.current.length>0, canRedo=futureRef.current.length>0;
  const dynamicCursor = tool==="draw" ? "crosshair" : cursorStyle;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24 md:pb-20">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><EyeOff className="w-5 h-5 text-red-600" /></div>
          <h1 className="text-2xl font-bold">Redact PDF</h1>
        </div>
        <p className="text-muted-foreground mb-8">Draw redaction boxes. Click any box to select, move, or resize it.</p>
        <div className="space-y-4">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset} />
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Applying redactions..." outputSize={outputSize} downloadLabel="Download Redacted PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`redacted-${file?.name||"output.pdf"}`)} onReset={()=>{setIsSuccess(false);setError(null);}} />

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
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Color</Label>
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-border" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">True Redact</Label>
                  <Switch checked={redactMode} onCheckedChange={setRedactMode} />
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

              {/* Selected box editor */}
              {selectedBox&&(
                <div className="bg-card border-2 border-primary/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-primary">Edit Box</p>
                    <Button size="sm" variant="ghost" onClick={()=>{pushCommit(boxesRef.current,boxesRef.current.filter(b=>b.id!==selectedId));setSelectedId(null);}} className="gap-1 text-destructive hover:text-destructive h-7 text-xs">
                      <Trash2 className="w-3 h-3"/>Delete
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {([["X",Math.round(selectedBox.x),(v:number)=>pushCommit(boxesRef.current,boxesRef.current.map(b=>b.id!==selectedId?b:updateNorm(b,v,b.y,b.width,b.height)))],
                       ["Y",Math.round(selectedBox.y),(v:number)=>pushCommit(boxesRef.current,boxesRef.current.map(b=>b.id!==selectedId?b:updateNorm(b,b.x,v,b.width,b.height)))],
                       ["W",Math.round(selectedBox.width),(v:number)=>pushCommit(boxesRef.current,boxesRef.current.map(b=>b.id!==selectedId?b:updateNorm(b,b.x,b.y,Math.max(8,v),b.height)))],
                       ["H",Math.round(selectedBox.height),(v:number)=>pushCommit(boxesRef.current,boxesRef.current.map(b=>b.id!==selectedId?b:updateNorm(b,b.x,b.y,b.width,Math.max(8,v))))],
                    ] as [string,number,(v:number)=>void][]).map(([lbl,val,onChange])=>(
                      <div key={lbl}>
                        <Label className="text-xs text-muted-foreground">{lbl} (px)</Label>
                        <Input type="number" value={val} onChange={e=>onChange(Number(e.target.value))} className="h-8 text-xs mt-1"/>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs">Color</Label>
                    <input type="color" value={selectedBox.color} onChange={e=>pushCommit(boxesRef.current,boxesRef.current.map(b=>b.id!==selectedId?b:{...b,color:e.target.value}))} className="w-7 h-7 rounded border border-border cursor-pointer"/>
                    <span className="text-xs text-muted-foreground ml-auto">{boxes.filter(b=>b.pageIndex===currentPage).length} box(es) on page</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {tool==="draw"?"Draw mode: drag to create · switch to Select to edit boxes":"Select mode: click box to edit · drag to move · drag handles to resize · 2 fingers = draw new"}
              </p>

              {boxes.length>0&&(
                <Button onClick={applyRedactions} className="w-full gap-2">
                  <Check className="w-4 h-4"/>Apply {boxes.length} Redaction{boxes.length>1?"s":""}
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
