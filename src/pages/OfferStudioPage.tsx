import { useParams, Link } from 'react-router-dom';
import { useOffer, useOfferPage } from '@/hooks/useOfferData';
import { useSmartBack } from '@/hooks/useSmartBack';
import { useSidebarState } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ArrowLeft, ExternalLink, Loader2, MessageSquare, SlidersHorizontal, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import OfferStudioChat from '@/components/offers/OfferStudioChat';
import OfferStudioSidebar from '@/components/offers/OfferStudioSidebar';
import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

function StudioPanel({ offer, page }: { offer: any; page: any }) {
  return (
    <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 h-full">
      <TabsList className="mx-3 mt-3 grid grid-cols-2 shrink-0">
        <TabsTrigger value="chat" className="text-xs"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Chat IA</TabsTrigger>
        <TabsTrigger value="edit" className="text-xs"><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Édition</TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
        <OfferStudioChat offer={offer} page={page} />
      </TabsContent>
      <TabsContent value="edit" className="flex-1 mt-0 min-h-0 overflow-y-auto">
        <OfferStudioSidebar offer={offer} page={page} />
      </TabsContent>
    </Tabs>
  );
}

export default function OfferStudioPage() {
  const { id } = useParams<{ id: string }>();
  const goBack = useSmartBack('/offers');
  const { data: offer, isLoading } = useOffer(id);
  const { data: page } = useOfferPage(id);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const isMobile = useIsMobile();
  const { collapsed, setCollapsed } = useSidebarState();
  const [panelOpen, setPanelOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < 1280);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (previewIframeRef.current && offer?.slug) {
      previewIframeRef.current.src = `/offers/${offer.slug}/page?_=${Date.now()}`;
    }
  }, [offer?.updated_at, page?.updated_at, offer?.slug]);

  if (isLoading || !offer || !page) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Break out of AppLayout padding using negative margins
  return (
    <div className="-mx-6 lg:-mx-8 -mt-2 -mb-6 lg:-mb-8 flex flex-col bg-background" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 h-14 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="shrink-0"
              title={collapsed ? 'Afficher le menu' : 'Réduire le menu'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="font-semibold text-sm truncate">{offer.name}</h1>
            <p className="text-xs text-muted-foreground">Studio d'édition</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isMobile && isCompact && (
            <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Éditer
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[380px] p-0 flex flex-col">
                <StudioPanel offer={offer} page={page} />
              </SheetContent>
            </Sheet>
          )}
          <Link to={`/offers/${offer.slug}/page`} target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Ouvrir</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Desktop large: split with resizable */}
      {!isMobile && !isCompact && (
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={28} minSize={22} maxSize={40} className="border-r border-border">
              <div className="h-full flex flex-col">
                <StudioPanel offer={offer} page={page} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={72} className="bg-muted/20">
              <iframe
                ref={previewIframeRef}
                src={`/offers/${offer.slug}/page`}
                className="w-full h-full border-0 bg-background"
                title="Aperçu landing"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {/* Tablet: preview fullscreen + Sheet for panel */}
      {!isMobile && isCompact && (
        <div className="flex-1 bg-muted/20 overflow-hidden">
          <iframe
            ref={previewIframeRef}
            src={`/offers/${offer.slug}/page`}
            className="w-full h-full border-0 bg-background"
            title="Aperçu landing"
          />
        </div>
      )}

      {/* Mobile: tabs */}
      {isMobile && (
        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-3 mt-3 grid grid-cols-3 shrink-0">
              <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
              <TabsTrigger value="edit" className="text-xs">Édition</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">Aperçu</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
              <OfferStudioChat offer={offer} page={page} />
            </TabsContent>
            <TabsContent value="edit" className="flex-1 mt-0 min-h-0 overflow-y-auto">
              <OfferStudioSidebar offer={offer} page={page} />
            </TabsContent>
            <TabsContent value="preview" className="flex-1 mt-0 min-h-0 overflow-hidden">
              <iframe
                src={`/offers/${offer.slug}/page?_=${offer.updated_at}`}
                className="w-full h-full border-0"
                title="Aperçu"
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
