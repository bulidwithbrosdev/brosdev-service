import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, ShieldAlert } from 'lucide-react';
import { getPublicWidgetForPage, recordWidgetEventClient } from '../widget-api/widgetsFirestore';
import { hydrateWidgetConfiguration, getWidgetDefinition } from '../widgets/catalog';
import { WidgetRenderer } from './WidgetRenderer';
import type { WidgetConfiguration, WidgetDeviceType, WidgetEventType, WidgetType } from '../widgets/types';

function detectDevice(): WidgetDeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

interface HostedWidgetState {
  status: 'loading' | 'ok' | 'not_found' | 'disabled' | 'draft';
  isPreview: boolean;
  widget?: {
    publicId: string;
    name: string;
    type: WidgetType;
    publishedVersion: number;
    configuration: WidgetConfiguration;
  };
}

export const HostedWidgetPage: React.FC<{ publicId: string }> = ({ publicId }) => {
  const [state, setState] = useState<HostedWidgetState>({
    status: 'loading',
    isPreview: false,
  });
  const trackedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const isPreview = params.get('preview') === '1';

    const loadWidget = async () => {
      try {
        // 1. Try public API endpoint first (works unauthenticated and enforces domain/schedule rules)
        if (!isPreview) {
          const res = await fetch(`/api/widgets/public/${encodeURIComponent(publicId)}`);
          if (res.ok) {
            const data = await res.json();
            if (active && data?.widget) {
              const type = data.widget.type as WidgetType;
              setState({
                status: 'ok',
                isPreview: false,
                widget: {
                  publicId: data.widget.publicId,
                  name: data.widget.name,
                  type,
                  publishedVersion: Number(data.widget.publishedVersion || 1),
                  configuration: hydrateWidgetConfiguration(type, data.widget.configuration),
                },
              });
              return;
            }
          } else if (res.status === 403) {
            const errData = await res.json().catch(() => ({}));
            if (active && errData?.status === 'disabled') {
              setState({ status: 'disabled', isPreview });
              return;
            }
          }
        }

        // 2. Fallback to Firestore direct lookup (supports preview mode or direct client read)
        const result = await getPublicWidgetForPage(publicId);
        if (!active) return;

        if (result.status === 'not_found' || !result.widget) {
          setState({ status: 'not_found', isPreview });
          return;
        }
        if (result.status === 'disabled') {
          setState({ status: 'disabled', isPreview });
          return;
        }
        if (result.status === 'draft' && !isPreview) {
          setState({ status: 'draft', isPreview });
          return;
        }

        setState({
          status: 'ok',
          isPreview,
          widget: {
            publicId: result.widget.publicId,
            name: result.widget.name,
            type: result.widget.type,
            publishedVersion: result.widget.publishedVersion,
            configuration: result.widget.configuration,
          },
        });
      } catch {
        if (active) setState({ status: 'not_found', isPreview });
      }
    };

    void loadWidget();
    return () => {
      active = false;
    };
  }, [publicId]);

  useEffect(() => {
    if (state.status !== 'ok' || !state.widget || state.isPreview || trackedRef.current) return;
    trackedRef.current = true;
    const device = detectDevice();
    void recordWidgetEventClient({ publicId: state.widget.publicId, eventType: 'load', device });
    void recordWidgetEventClient({ publicId: state.widget.publicId, eventType: 'impression', device });
  }, [state]);

  const handleWidgetEvent = (eventType: WidgetEventType) => {
    if (!state.widget || state.isPreview) return;
    void recordWidgetEventClient({
      publicId: state.widget.publicId,
      eventType,
      device: detectDevice(),
    });
  };

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-sm font-medium text-[#525252]">
          <div className="w-6 h-6 rounded bg-[#A90706] flex items-center justify-center text-white font-bold text-xs">
            B
          </div>
          <span>Loading widget...</span>
        </div>
      </div>
    );
  }

  if (state.status === 'not_found' || state.status === 'draft' || state.status === 'disabled') {
    const title =
      state.status === 'disabled'
        ? 'Widget Unavailable'
        : state.status === 'draft'
          ? 'Widget Not Published Yet'
          : 'Widget Not Found';
    const description =
      state.status === 'disabled'
        ? 'This widget has been disabled by the workspace owner or platform administrator.'
        : state.status === 'draft'
          ? 'This component is still in draft mode. Publish it from the BrosDev Widget Builder to make it publicly accessible.'
          : 'The requested widget identifier does not match any active hosted component.';

    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E5E5E5] rounded-xl p-8 text-center space-y-4">
          <div className="w-11 h-11 rounded-lg bg-[#FEF2F2] text-[#A90706] mx-auto flex items-center justify-center">
            {state.status === 'disabled' ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-[#111111]">{title}</h1>
            <p className="text-xs leading-relaxed text-[#525252]">{description}</p>
          </div>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-[#111111] text-white hover:bg-[#262626] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Go to BrosDev Developer Services
            </a>
          </div>
        </div>
      </div>
    );
  }

  const widget = state.widget!;
  const def = getWidgetDefinition(widget.type);
  const isDarkTheme = widget.configuration.style.theme === 'dark';

  return (
    <div
      className={`min-h-screen flex flex-col ${
        isDarkTheme ? 'bg-[#0F0F0F] text-white' : 'bg-[#F5F5F5] text-[#111111]'
      }`}
    >
      {state.isPreview && (
        <div className="bg-[#111111] text-white px-4 py-2.5 flex items-center justify-between text-xs border-b border-white/10">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-[#A90706]" />
            <span className="font-semibold">Preview Mode</span>
            <span className="opacity-70">· {widget.name} ({def.name})</span>
          </div>
          <span className="font-mono text-[11px] opacity-75">v{widget.publishedVersion} · Analytics paused</span>
        </div>
      )}

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl">
          <WidgetRenderer
            type={widget.type}
            config={widget.configuration}
            scopeId={widget.publicId}
            onEvent={handleWidgetEvent}
          />
        </div>
      </main>

      {widget.configuration.showBranding && (
        <footer
          className={`py-4 px-6 text-center text-[11px] border-t ${
            isDarkTheme
              ? 'border-white/10 text-white/50'
              : 'border-[#E5E5E5] bg-white text-[#737373]'
          }`}
        >
          Hosted by <span className="font-semibold">BrosDev Developer Services</span> · Component ID{' '}
          <span className="font-mono">{widget.publicId}</span>
        </footer>
      )}
    </div>
  );
};
