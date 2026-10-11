import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { RecentProvider } from "@/contexts/RecentContext";
import { CurrentPdfProvider } from "@/contexts/CurrentPdfContext";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import MergePDF from "@/pages/MergePDF";
import SplitPDF from "@/pages/SplitPDF";
import CompressPDF from "@/pages/CompressPDF";
import RotatePDF from "@/pages/RotatePDF";
import WatermarkPDF from "@/pages/WatermarkPDF";
import ProtectPDF from "@/pages/ProtectPDF";
import UnlockPDF from "@/pages/UnlockPDF";
import ExtractPages from "@/pages/ExtractPages";
import ReorderPages from "@/pages/ReorderPages";
import PdfToText from "@/pages/PdfToText";
import PdfMetadata from "@/pages/PdfMetadata";
import PdfToJpg from "@/pages/PdfToJpg";
import ImagesToPdf from "@/pages/ImagesToPdf";
import TxtToPdf from "@/pages/TxtToPdf";
import BackgroundColor from "@/pages/BackgroundColor";
import ReadAloud from "@/pages/ReadAloud";
import HeaderFooter from "@/pages/HeaderFooter";
import SignPDF from "@/pages/SignPDF";
import PageTools from "@/pages/PageTools";
import MarkdownToPdf from "@/pages/MarkdownToPdf";
import MakeSearchable from "@/pages/MakeSearchable";
import SmartSearch from "@/pages/SmartSearch";
import ExtractTables from "@/pages/ExtractTables";
import TableOfContents from "@/pages/TableOfContents";
import PdfInfoFull from "@/pages/PdfInfoFull";
import PdfToMd from "@/pages/PdfToMd";
import RedactPDF from "@/pages/RedactPDF";
import AnnotatePDF from "@/pages/AnnotatePDF";
import PageSizeConverter from "@/pages/PageSizeConverter";
import FlattenPDF from "@/pages/FlattenPDF";
import RepairPDF from "@/pages/RepairPDF";
import BatesNumbering from "@/pages/BatesNumbering";
import BookletImposition from "@/pages/BookletImposition";
import NupLayout from "@/pages/NupLayout";
import ReversePages from "@/pages/ReversePages";
import DuplexPrep from "@/pages/DuplexPrep";
import DateStamp from "@/pages/DateStamp";
import ChangePassword from "@/pages/ChangePassword";
import AttachmentExtractor from "@/pages/AttachmentExtractor";
import QRStamp from "@/pages/QRStamp";
import CropTrimBox from "@/pages/CropTrimBox";
import SplitByBookmark from "@/pages/SplitByBookmark";
import LinkExtractor from "@/pages/LinkExtractor";
import FontInspector from "@/pages/FontInspector";
import ThumbnailGenerator from "@/pages/ThumbnailGenerator";
import SearchHighlight from "@/pages/SearchHighlight";
import PdfWhiteboard from "@/pages/PdfWhiteboard";
import DeskewPDF from "@/pages/DeskewPDF";
import EnhanceScan from "@/pages/EnhanceScan";
import BackgroundWhitener from "@/pages/BackgroundWhitener";
import DocumentClassifier from "@/pages/DocumentClassifier";
import SignatureDetector from "@/pages/SignatureDetector";
import InvoiceExtractor from "@/pages/InvoiceExtractor";
import LayoutAnalyzer from "@/pages/LayoutAnalyzer";
import HeicToPdf from "@/pages/HeicToPdf";
import AudiobookExport from "@/pages/AudiobookExport";
import PdfCompare from "@/pages/PdfCompare";
import BookmarkEditor from "@/pages/BookmarkEditor";
import AnalyticsDashboard from "@/pages/AnalyticsDashboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Switch key={location} location={location}>
        <Route path="/" component={() => <AnimatedPage><Home /></AnimatedPage>} />
        <Route path="/merge" component={() => <AnimatedPage><MergePDF /></AnimatedPage>} />
        <Route path="/split" component={() => <AnimatedPage><SplitPDF /></AnimatedPage>} />
        <Route path="/compress" component={() => <AnimatedPage><CompressPDF /></AnimatedPage>} />
        <Route path="/rotate" component={() => <AnimatedPage><RotatePDF /></AnimatedPage>} />
        <Route path="/watermark" component={() => <AnimatedPage><WatermarkPDF /></AnimatedPage>} />
        <Route path="/protect" component={() => <AnimatedPage><ProtectPDF /></AnimatedPage>} />
        <Route path="/unlock" component={() => <AnimatedPage><UnlockPDF /></AnimatedPage>} />
        <Route path="/extract" component={() => <AnimatedPage><ExtractPages /></AnimatedPage>} />
        <Route path="/reorder" component={() => <AnimatedPage><ReorderPages /></AnimatedPage>} />
        <Route path="/pdf-to-text" component={() => <AnimatedPage><PdfToText /></AnimatedPage>} />
        <Route path="/metadata" component={() => <AnimatedPage><PdfMetadata /></AnimatedPage>} />
        <Route path="/pdf-to-jpg" component={() => <AnimatedPage><PdfToJpg /></AnimatedPage>} />
        <Route path="/images-to-pdf" component={() => <AnimatedPage><ImagesToPdf /></AnimatedPage>} />
        <Route path="/txt-to-pdf" component={() => <AnimatedPage><TxtToPdf /></AnimatedPage>} />
        <Route path="/background-color" component={() => <AnimatedPage><BackgroundColor /></AnimatedPage>} />
        <Route path="/read-aloud" component={() => <AnimatedPage><ReadAloud /></AnimatedPage>} />
        <Route path="/header-footer" component={() => <AnimatedPage><HeaderFooter /></AnimatedPage>} />
        <Route path="/sign-pdf" component={() => <AnimatedPage><SignPDF /></AnimatedPage>} />
        <Route path="/page-tools" component={() => <AnimatedPage><PageTools /></AnimatedPage>} />
        <Route path="/markdown-to-pdf" component={() => <AnimatedPage><MarkdownToPdf /></AnimatedPage>} />
        <Route path="/make-searchable" component={() => <AnimatedPage><MakeSearchable /></AnimatedPage>} />
        <Route path="/smart-search" component={() => <AnimatedPage><SmartSearch /></AnimatedPage>} />
        <Route path="/extract-tables" component={() => <AnimatedPage><ExtractTables /></AnimatedPage>} />
        <Route path="/table-of-contents" component={() => <AnimatedPage><TableOfContents /></AnimatedPage>} />
        <Route path="/pdf-info" component={() => <AnimatedPage><PdfInfoFull /></AnimatedPage>} />
        <Route path="/pdf-to-md" component={() => <AnimatedPage><PdfToMd /></AnimatedPage>} />
        <Route path="/redact-pdf" component={() => <AnimatedPage><RedactPDF /></AnimatedPage>} />
        <Route path="/annotate-pdf" component={() => <AnimatedPage><AnnotatePDF /></AnimatedPage>} />
        <Route path="/page-size" component={() => <AnimatedPage><PageSizeConverter /></AnimatedPage>} />
        <Route path="/flatten-pdf" component={() => <AnimatedPage><FlattenPDF /></AnimatedPage>} />
        <Route path="/repair-pdf" component={() => <AnimatedPage><RepairPDF /></AnimatedPage>} />
        <Route path="/bates" component={() => <AnimatedPage><BatesNumbering /></AnimatedPage>} />
        <Route path="/booklet" component={() => <AnimatedPage><BookletImposition /></AnimatedPage>} />
        <Route path="/nup" component={() => <AnimatedPage><NupLayout /></AnimatedPage>} />
        <Route path="/reverse-pages" component={() => <AnimatedPage><ReversePages /></AnimatedPage>} />
        <Route path="/duplex-prep" component={() => <AnimatedPage><DuplexPrep /></AnimatedPage>} />
        <Route path="/date-stamp" component={() => <AnimatedPage><DateStamp /></AnimatedPage>} />
        <Route path="/change-password" component={() => <AnimatedPage><ChangePassword /></AnimatedPage>} />
        <Route path="/extract-attachments" component={() => <AnimatedPage><AttachmentExtractor /></AnimatedPage>} />
        <Route path="/qr-stamp" component={() => <AnimatedPage><QRStamp /></AnimatedPage>} />
        <Route path="/crop" component={() => <AnimatedPage><CropTrimBox /></AnimatedPage>} />
        <Route path="/split-bookmarks" component={() => <AnimatedPage><SplitByBookmark /></AnimatedPage>} />
        <Route path="/extract-links" component={() => <AnimatedPage><LinkExtractor /></AnimatedPage>} />
        <Route path="/font-inspector" component={() => <AnimatedPage><FontInspector /></AnimatedPage>} />
        <Route path="/thumbnails" component={() => <AnimatedPage><ThumbnailGenerator /></AnimatedPage>} />
        <Route path="/search-highlight" component={() => <AnimatedPage><SearchHighlight /></AnimatedPage>} />
        <Route path="/whiteboard" component={() => <AnimatedPage><PdfWhiteboard /></AnimatedPage>} />
        <Route path="/deskew" component={() => <AnimatedPage><DeskewPDF /></AnimatedPage>} />
        <Route path="/enhance-scan" component={() => <AnimatedPage><EnhanceScan /></AnimatedPage>} />
        <Route path="/whiten-bg" component={() => <AnimatedPage><BackgroundWhitener /></AnimatedPage>} />
        <Route path="/classify" component={() => <AnimatedPage><DocumentClassifier /></AnimatedPage>} />
        <Route path="/detect-signatures" component={() => <AnimatedPage><SignatureDetector /></AnimatedPage>} />
        <Route path="/invoice-extractor" component={() => <AnimatedPage><InvoiceExtractor /></AnimatedPage>} />
        <Route path="/layout-analyzer" component={() => <AnimatedPage><LayoutAnalyzer /></AnimatedPage>} />
        <Route path="/heic-to-pdf" component={() => <AnimatedPage><HeicToPdf /></AnimatedPage>} />
        <Route path="/audiobook" component={() => <AnimatedPage><AudiobookExport /></AnimatedPage>} />
        <Route path="/compare" component={() => <AnimatedPage><PdfCompare /></AnimatedPage>} />
        <Route path="/bookmark-editor" component={() => <AnimatedPage><BookmarkEditor /></AnimatedPage>} />
        <Route path="/analytics" component={() => <AnimatedPage><AnalyticsDashboard /></AnimatedPage>} />
        <Route component={() => <AnimatedPage><NotFound /></AnimatedPage>} />
      </Switch>
    </AnimatePresence>
  );
}

function AndroidBackButton() {
  const [location, navigate] = useHashLocation();
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (location !== "/" && location !== "") { e.preventDefault(); navigate("/"); }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [location, navigate]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <CurrentPdfProvider>
          <RecentProvider>
            <TooltipProvider>
            <WouterRouter hook={useHashLocation}>
              <AndroidBackButton />
              <Layout>
                <Router />
              </Layout>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
          </RecentProvider>
        </CurrentPdfProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
