import { useState } from "react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import { Receipt, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface InvoiceData {
  invoiceNumber: string; date: string; dueDate: string; vendor: string;
  total: string; subtotal: string; tax: string; currency: string;
  lineItems: {desc:string;qty:string;price:string}[];
  rawFields: {label:string;value:string}[];
}

function extractInvoice(text: string): InvoiceData {
  const find = (patterns: RegExp[]) => { for(const p of patterns){const m=text.match(p);if(m)return m[1]?.trim()||"";} return ""; };
  const invoiceNumber = find([/invoice\s*#?\s*:?\s*([A-Z0-9-]{3,20})/i,/inv\s*#?\s*:?\s*([A-Z0-9-]{3,20})/i]);
  const date = find([/(?:invoice\s*)?date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,/(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i]);
  const dueDate = find([/due\s*(?:date|by)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,/payment\s*due\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i]);
  const total = find([/total\s*(?:amount|due|:)?\s*\$?([\d,]+\.?\d{0,2})/i,/amount\s*(?:due|total)\s*\$?([\d,]+\.?\d{0,2})/i]);
  const subtotal = find([/sub\s*total\s*:?\s*\$?([\d,]+\.?\d{0,2})/i]);
  const tax = find([/(?:tax|vat|gst)\s*(?:\d+%?)?\s*:?\s*\$?([\d,]+\.?\d{0,2})/i]);
  const currency = text.match(/\$|USD|EUR|GBP|CAD/)?.[0]||"";
  const lines = text.split("\n").filter(l=>l.trim());
  const vendor = lines.slice(0,8).find(l=>l.length>3&&l.length<60&&!/invoice|date|number|#/i.test(l))||"";
  const rawFields: {label:string;value:string}[] = [];
  text.split("\n").forEach(line=>{const m=line.match(/^([A-Za-z\s]{3,30}):?\s+([\S].+)$/);if(m&&m[1]&&m[2])rawFields.push({label:m[1].trim(),value:m[2].trim()});});
  return {invoiceNumber,date,dueDate,vendor,total,subtotal,tax,currency,lineItems:[],rawFields:rawFields.slice(0,15)};
}

export default function InvoiceExtractor() {
  const [file,setFile]=useState<File|null>(null);
  const [data,setData]=useState<InvoiceData|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const analyze = async (f: File) => {
    setFile(f); setData(null); setError(null); setLoading(true);
    try {
      const doc = await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;
      let text="";
      for(let i=1;i<=Math.min(doc.numPages,3);i++){const p=await doc.getPage(i);const tc=await p.getTextContent();text+=tc.items.map((it:any)=>it.str).join(" ")+"\n";}
      setData(extractInvoice(text));
    } catch(e:unknown){setError((e as Error).message);}
    finally{setLoading(false);}
  };

  const exportJSON=()=>{ if(!data) return; const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="invoice.json";a.click();URL.revokeObjectURL(url); };
  const reset=()=>{setFile(null);setData(null);setError(null);};

  const fields = data ? [
    ["Invoice #",data.invoiceNumber],["Date",data.date],["Due Date",data.dueDate],
    ["Vendor",data.vendor],["Subtotal",data.currency+data.subtotal],["Tax",data.currency+data.tax],["Total",data.currency+data.total],
  ] : [];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 pb-24">
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-green-600"/></div>
          <h1 className="text-2xl font-bold">Invoice Extractor</h1>
        </div>
        <p className="text-muted-foreground mb-8">Extract structured data from invoice PDFs — totals, dates, vendor, and fields.</p>
        <div className="space-y-5">
          <FileDropZone onFileSelect={analyze} selectedFile={file} onClear={reset}/>
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Parsing invoice…</p>}
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">{error}</div>}
          {data && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Extracted Data</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(JSON.stringify(data,null,2))} className="gap-1 text-xs"><Copy className="w-3.5 h-3.5"/>Copy JSON</Button>
                  <Button size="sm" variant="outline" onClick={exportJSON} className="gap-1 text-xs"><Download className="w-3.5 h-3.5"/>JSON</Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {fields.filter(([,v])=>v&&v.length>1).map(([l,v])=>(
                  <div key={l} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-muted-foreground">{l}</span>
                    <span className="text-sm font-medium">{v}</span>
                  </div>
                ))}
              </div>
              {data.rawFields.length>0&&(
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Additional Fields</p>
                  <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden max-h-48 overflow-y-auto">
                    {data.rawFields.map((f,i)=>(
                      <div key={i} className="flex items-start justify-between px-4 py-2 text-xs"><span className="text-muted-foreground mr-4">{f.label}</span><span className="text-right max-w-[60%] break-words">{f.value}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
