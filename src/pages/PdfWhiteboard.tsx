import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PDFDocument, rgb, LineCapStyle } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { PenTool, Minus, Square, Circle as CircleIcon, Type, Trash2, Undo2, Check, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileDropZone from "@/components/FileDropZone";
import ProcessingState from "@/components/ProcessingState";
import { useCurrentPdf } from "@/contexts/CurrentPdfContext";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
function downloadBlob(b: Uint8Array, n: string) { const url=URL.createObjectURL(new Blob([b.slice()],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=n;a.click();URL.revokeObjectURL(url); }

type Tool = "pen"|"line"|"arrow"|"rect"|"ellipse"|"text";
interface Stroke { tool: Tool; points: [number,number][]; color: string; width: number; text?: string; }

export default function PdfWhiteboard() {
  const [file,setFile]=useState<File|null>(null);
  const [pageCount,setPageCount]=useState(0);
  const [currentPage,setCurrentPage]=useState(0);
  const [strokes,setStrokes]=useState<Map<number,Stroke[]>>(new Map());
  const [tool,setTool]=useState<Tool>("pen");
  const [color,setColor]=useState("#e11d48");
  const [lineWidth,setLineWidth]=useState([3]);
  const [isProcessing,setIsProcessing]=useState(false);
  const [isSuccess,setIsSuccess]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [resultBytes,setResultBytes]=useState<Uint8Array|null>(null);
  const [outputSize,setOutputSize]=useState(0);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const overlayRef=useRef<HTMLCanvasElement>(null);
  const pdfRef=useRef<pdfjs.PDFDocumentProxy|null>(null);
  const vpRef=useRef({scale:1,width:0,height:0});
  const drawing=useRef(false);
  const currentStroke=useRef<[number,number][]>([]);
  const strokesRef=useRef(strokes); strokesRef.current=strokes;
  const colorRef=useRef(color); colorRef.current=color;
  const widthRef=useRef(lineWidth); widthRef.current=lineWidth;
  const toolRef=useRef(tool); toolRef.current=tool;
  const curPageRef=useRef(currentPage); curPageRef.current=currentPage;
  const { update: updatePdf } = useCurrentPdf();

  const renderPage = useCallback(async (idx:number) => {
    if (!pdfRef.current||!canvasRef.current) return;
    const page = await pdfRef.current.getPage(idx+1);
    const vp = page.getViewport({scale:1.5});
    vpRef.current={scale:vp.scale,width:vp.width,height:vp.height};
    const c=canvasRef.current; c.width=vp.width; c.height=vp.height;
    if(overlayRef.current){overlayRef.current.width=vp.width;overlayRef.current.height=vp.height;}
    await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    redrawStrokes(idx);
  },[]);

  const redrawStrokes = useCallback((pi=currentPage) => {
    const oc=overlayRef.current; if(!oc) return;
    const ctx=oc.getContext("2d")!;
    ctx.clearRect(0,0,oc.width,oc.height);
    (strokesRef.current.get(pi)||[]).forEach(s=>drawStroke(ctx,s));
  },[currentPage]);

  const drawStroke=(ctx:CanvasRenderingContext2D,s:Stroke)=>{
    ctx.strokeStyle=s.color; ctx.fillStyle=s.color; ctx.lineWidth=s.width;
    ctx.lineCap="round"; ctx.lineJoin="round"; ctx.setLineDash([]);
    if(s.tool==="pen"&&s.points.length>1){
      ctx.beginPath(); ctx.moveTo(s.points[0][0],s.points[0][1]);
      s.points.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.stroke();
    } else if((s.tool==="line"||s.tool==="arrow")&&s.points.length>=2){
      const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      if(s.tool==="arrow"){
        const ang=Math.atan2(y2-y1,x2-x1),hw=s.width*4;
        ctx.beginPath();ctx.moveTo(x2,y2);
        ctx.lineTo(x2-hw*Math.cos(ang-Math.PI/6),y2-hw*Math.sin(ang-Math.PI/6));
        ctx.lineTo(x2-hw*Math.cos(ang+Math.PI/6),y2-hw*Math.sin(ang+Math.PI/6));
        ctx.closePath();ctx.fill();
      }
    } else if(s.tool==="rect"&&s.points.length>=2){
      const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
      ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    } else if(s.tool==="ellipse"&&s.points.length>=2){
      const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
      ctx.beginPath();ctx.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,Math.PI*2);ctx.stroke();
    } else if(s.tool==="text"&&s.text&&s.points[0]){
      ctx.font=`${s.width*5}px sans-serif`;ctx.fillText(s.text,s.points[0][0],s.points[0][1]);
    }
  };

  const toCanvas=(cx:number,cy:number)=>{
    const oc=overlayRef.current!,r=oc.getBoundingClientRect();
    return [((cx-r.left)*(oc.width/r.width)),(cy-r.top)*(oc.height/r.height)] as [number,number];
  };

  const onDown=(cx:number,cy:number)=>{
    if(toolRef.current==="text"){
      const txt=prompt("Enter text:");
      if(!txt) return;
      const p=toCanvas(cx,cy);
      const s:Stroke={tool:"text",points:[p],color:colorRef.current,width:widthRef.current[0],text:txt};
      addStroke(s); return;
    }
    drawing.current=true; currentStroke.current=[toCanvas(cx,cy)];
  };
  const onMove=(cx:number,cy:number)=>{
    if(!drawing.current) return;
    currentStroke.current.push(toCanvas(cx,cy));
    const oc=overlayRef.current; if(!oc) return;
    const ctx=oc.getContext("2d")!;
    ctx.clearRect(0,0,oc.width,oc.height);
    (strokesRef.current.get(curPageRef.current)||[]).forEach(s=>drawStroke(ctx,s));
    drawStroke(ctx,{tool:toolRef.current,points:currentStroke.current,color:colorRef.current,width:widthRef.current[0]});
  };
  const onUp=()=>{
    if(!drawing.current) return; drawing.current=false;
    if(currentStroke.current.length<2) return;
    addStroke({tool:toolRef.current,points:[...currentStroke.current],color:colorRef.current,width:widthRef.current[0]});
    currentStroke.current=[];
  };

  const addStroke=(s:Stroke)=>{
    setStrokes(prev=>{const m=new Map(prev);m.set(curPageRef.current,[...(m.get(curPageRef.current)||[]),s]);return m;});
  };

  useEffect(()=>{ redrawStrokes(currentPage); },[strokes,currentPage,redrawStrokes]);

  const handleFile=async(f:File)=>{
    setFile(f);setStrokes(new Map());setIsSuccess(false);setError(null);
    const doc=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
    pdfRef.current=doc;setPageCount(doc.numPages);setCurrentPage(0);
    await renderPage(0);
  };
  useEffect(()=>{if(pdfRef.current)renderPage(currentPage);},[currentPage,renderPage]);

  const undo=()=>{setStrokes(prev=>{const m=new Map(prev);const ps=m.get(currentPage)||[];m.set(currentPage,ps.slice(0,-1));return m;});};

  const embed=async()=>{
    if(!file) return;
    setIsProcessing(true);setError(null);
    try{
      const doc=await PDFDocument.load(await file.arrayBuffer());
      for(const [pi,ss] of strokes.entries()){
        if(!ss.length) continue;
        const page=doc.getPage(pi);
        const {width:pw,height:ph}=page.getSize();
        const vp=vpRef.current;
        const sx=pw/vp.width,sy=ph/vp.height;
        ss.forEach(s=>{
          const [r,g,b]=s.color.match(/\w\w/g)!.map(v=>parseInt(v,16)/255);
          const c=rgb(r,g,b);
          if((s.tool==="pen")&&s.points.length>1){
            for(let i=1;i<s.points.length;i++){
              page.drawLine({start:{x:s.points[i-1][0]*sx,y:ph-s.points[i-1][1]*sy},end:{x:s.points[i][0]*sx,y:ph-s.points[i][1]*sy},thickness:s.width,color:c,lineCap:LineCapStyle.Round});
            }
          } else if((s.tool==="line"||s.tool==="arrow")&&s.points.length>=2){
            const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
            page.drawLine({start:{x:x1*sx,y:ph-y1*sy},end:{x:x2*sx,y:ph-y2*sy},thickness:s.width,color:c});
          } else if(s.tool==="rect"&&s.points.length>=2){
            const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
            page.drawRectangle({x:Math.min(x1,x2)*sx,y:ph-Math.max(y1,y2)*sy,width:Math.abs(x2-x1)*sx,height:Math.abs(y2-y1)*sy,borderColor:c,borderWidth:s.width,opacity:0});
          } else if(s.tool==="ellipse"&&s.points.length>=2){
            const [x1,y1]=s.points[0],[x2,y2]=s.points[s.points.length-1];
            page.drawEllipse({x:((x1+x2)/2)*sx,y:ph-((y1+y2)/2)*sy,xScale:Math.abs(x2-x1)/2*sx,yScale:Math.abs(y2-y1)/2*sy,borderColor:c,borderWidth:s.width,opacity:0});
          } else if(s.tool==="text"&&s.text&&s.points[0]){
            page.drawText(s.text,{x:s.points[0][0]*sx,y:ph-s.points[0][1]*sy,size:s.width*5,color:c});
          }
        });
      }
      const result=await doc.save();
      setResultBytes(result);setOutputSize(result.byteLength);setIsSuccess(true);
      updatePdf({ bytes: result, name: `whiteboard-${file.name}` });
    }catch(e:unknown){setError((e as Error).message);}
    finally{setIsProcessing(false);}
  };

  const reset=()=>{setFile(null);setStrokes(new Map());setPageCount(0);setCurrentPage(0);setIsSuccess(false);setError(null);setResultBytes(null);pdfRef.current=null;};
  const pageStrokes=(strokes.get(currentPage)||[]).length;

  const tools=[
    {id:"pen",icon:PenTool,label:"Pen"},{id:"line",icon:Minus,label:"Line"},
    {id:"arrow",icon:Minus,label:"Arrow"},{id:"rect",icon:Square,label:"Rect"},
    {id:"ellipse",icon:CircleIcon,label:"Ellipse"},{id:"text",icon:Type,label:"Text"},
  ] as const;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><PenTool className="w-5 h-5 text-rose-600"/></div>
          <h1 className="text-2xl font-bold">PDF Whiteboard</h1>
        </div>
        <p className="text-muted-foreground mb-8">Draw freehand, lines, arrows, shapes and text directly on PDF pages.</p>
        <div className="space-y-4">
          <FileDropZone onFileSelect={handleFile} selectedFile={file} onClear={reset}/>
          <ProcessingState isProcessing={isProcessing} isSuccess={isSuccess} error={error} label="Embedding drawings…" outputSize={outputSize} downloadLabel="Download PDF" onDownload={()=>resultBytes&&downloadBlob(resultBytes,`whiteboard-${file?.name}`)} onReset={()=>{setIsSuccess(false);setError(null);}}/>
          {file && !isProcessing && !isSuccess && !error && (
            <div className="space-y-3">
              <div className="bg-card border border-border rounded-2xl p-3 flex flex-wrap gap-2 items-center">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {tools.map(({id,label})=>(
                    <button key={id} onClick={()=>setTool(id as Tool)} className={`px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-border first:border-l-0 ${tool===id?"bg-primary text-primary-foreground":"hover:bg-accent"}`}>{label}</button>
                  ))}
                </div>
                <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer"/>
                <div className="flex items-center gap-2 w-32"><Label className="text-xs whitespace-nowrap">Width</Label><Slider value={lineWidth} onValueChange={setLineWidth} min={1} max={20} step={1}/></div>
                {pageCount>1&&<Select value={String(currentPage)} onValueChange={v=>setCurrentPage(Number(v))}><SelectTrigger className="w-28 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:pageCount},(_,i)=><SelectItem key={i} value={String(i)}>Page {i+1}</SelectItem>)}</SelectContent></Select>}
                <div className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" onClick={undo} className="w-8 h-8" disabled={pageStrokes===0}><Undo2 className="w-3.5 h-3.5"/></Button>
                  <Button size="sm" variant="ghost" onClick={()=>setStrokes(p=>{const m=new Map(p);m.set(currentPage,[]);return m;})} disabled={pageStrokes===0} className="text-xs text-destructive gap-1"><Trash2 className="w-3.5 h-3.5"/>Clear</Button>
                </div>
              </div>
              <div className="relative border border-border rounded-xl overflow-hidden bg-white select-none" style={{cursor:tool==="text"?"text":"crosshair"}}>
                <canvas ref={canvasRef} className="block w-full"/>
                <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" style={{touchAction:"none"}}
                  onMouseDown={e=>onDown(e.clientX,e.clientY)} onMouseMove={e=>onMove(e.clientX,e.clientY)} onMouseUp={onUp} onMouseLeave={onUp}
                  onTouchStart={e=>{e.preventDefault();onDown(e.touches[0].clientX,e.touches[0].clientY);}}
                  onTouchMove={e=>{e.preventDefault();onMove(e.touches[0].clientX,e.touches[0].clientY);}}
                  onTouchEnd={e=>{e.preventDefault();onUp();}}/>
              </div>
              <p className="text-xs text-muted-foreground text-center">{pageStrokes} drawing(s) on this page</p>
              {[...strokes.values()].some(s=>s.length>0) && <Button onClick={embed} className="w-full gap-2"><Check className="w-4 h-4"/>Embed All Drawings</Button>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
