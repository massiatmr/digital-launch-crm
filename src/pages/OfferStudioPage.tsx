import { useParams, Link } from 'react-router-dom';
import { useOffer, useOfferPage } from '@/hooks/useOfferData';
import { useSmartBack } from '@/hooks/useSmartBack';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Loader2, Eye, MessageSquare, SlidersHorizontal } from 'lucide-react';
import OfferStudioChat from '@/components/offers/OfferStudioChat';
import OfferStudioSidebar from '@/components/offers/OfferStudioSidebar';
import PublicOfferPage from '@/pages/PublicOfferPage';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export default function OfferStudioPage() {
  const { id } = useParams<{ id: string }>();
  const goBack = useSmartBack('/offers');
  const { data: offer, isLoading } = useOffer(id);
  const { data: page } = useOfferPage(id);
  const qc = useQueryClient();
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Force iframe reload when offer/page changes
  useEffect(() => {
    if (previewIframeRef.current && offer?.slug) {
      previewIframeRef.current.src = `/offers/${offer.slug}/page?_=${Date.now()}`;
    }
  }, [offer?.updated_at, page?.updated_at, offer?.slug]);

  if (isLoading || !offer || !page) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 h-14 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm truncate">{offer.name}</h1>
            <p className="text-xs text-muted-foreground">Studio d'édition</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/offers/${offer.slug}/page`} target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Ouvrir</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Desktop: split layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left: chat + sidebar tabs */}
        <div className="w-[420px] shrink-0 border-r border-border flex flex-col">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-3 mt-3 grid grid-cols-2">
              <TabsTrigger value="chat" className="text-xs"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Chat IA</TabsTrigger>
              <TabsTrigger value="edit" className="text-xs"><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Édition</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
              <OfferStudioChat offer={offer} page={page} />
            </TabsContent>
            <TabsContent value="edit" className="flex-1 mt-0 min-h-0">
              <OfferStudioSidebar offer={offer} page={page} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: live preview */}
        <div className="flex-1 bg-muted/20 overflow-hidden">
          <iframe
            ref={previewIframeRef}
            src={`/offers/${offer.slug}/page`}
            className="w-full h-full border-0 bg-background"
            title="Aperçu landing"
          />
        </div>
      </div>

      {/* Mobile: tabs */}
      <div className="md:hidden flex-1 min-h-0 flex flex-col">
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 mt-3 grid grid-cols-3">
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
    </div>
  );
}
