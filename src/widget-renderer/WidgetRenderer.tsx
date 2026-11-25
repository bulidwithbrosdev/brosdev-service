import React, { useMemo, useState } from 'react';
import type { WidgetConfiguration, WidgetEventType, WidgetType } from '../widgets/types';
import { validateAndScopeCustomCss } from '../widgets/security';
import { UiWidgetsPart1 } from './uiWidgetsPart1';
import { UiWidgetsPart2 } from './uiWidgetsPart2';
import { BusinessWidgets } from './businessWidgets';

const PART_1_TYPES = new Set<WidgetType>([
  'announcement_bar',
  'popup_modal',
  'cookie_consent',
  'pricing_table',
  'faq_accordion',
  'testimonial_slider',
  'countdown_timer',
  'floating_contact',
  'review_widget',
  'social_share',
]);

const PART_2_TYPES = new Set<WidgetType>([
  'toast_notification',
  'back_to_top',
  'reading_progress',
  'sticky_cta',
  'feedback_widget',
  'image_gallery',
  'before_after_slider',
  'table_of_contents',
  'newsletter_popup',
  'exit_intent_popup',
]);

export interface WidgetRendererProps {
  type: WidgetType;
  config: WidgetConfiguration;
  scopeId?: string;
  previewTheme?: 'light' | 'dark';
  onEvent?: (eventType: WidgetEventType, detail?: string) => void;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  type,
  config,
  scopeId = 'preview',
  previewTheme,
  onEvent,
}) => {
  const [dismissed, setDismissed] = useState(false);

  const scopeClass = `bd-widget-scope-${scopeId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Apply preview theme override if user toggles dark/light preview while keeping custom colors intact
  const effectiveConfig = useMemo<WidgetConfiguration>(() => {
    const s = config.style;
    if (s.theme === 'dark' || (previewTheme === 'dark' && s.theme === 'light' && s.backgroundColor.toUpperCase() === '#FFFFFF')) {
      return {
        ...config,
        style: {
          ...s,
          backgroundColor: '#171717',
          textColor: '#F5F5F5',
          borderColor: '#2E2E2E',
        },
      };
    }
    return config;
  }, [config, previewTheme]);

  const cssCheck = useMemo(
    () => validateAndScopeCustomCss(effectiveConfig.customCss || '', `.${scopeClass}`),
    [effectiveConfig.customCss, scopeClass]
  );

  const s = effectiveConfig.style;
  const shadowMap: Record<typeof s.shadow, string> = {
    none: 'none',
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 8px 24px rgba(0,0,0,0.12)',
    lg: '0 18px 42px rgba(0,0,0,0.2)',
  };

  if (dismissed) {
    return (
      <div className="p-4 text-center text-xs text-[#737373] border border-dashed border-[#D4D4D4] rounded-lg bg-white/80">
        <span>Widget dismissed in preview. </span>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="font-semibold text-[#A90706] hover:underline cursor-pointer"
        >
          Restore preview
        </button>
      </div>
    );
  }

  return (
    <div
      className={scopeClass}
      style={{
        width: s.width || '100%',
        maxWidth: s.maxWidthPx ? `${s.maxWidthPx}px` : undefined,
        height: s.height && s.height !== 'auto' ? s.height : undefined,
        margin: s.marginPx ? `${s.marginPx}px auto` : '0 auto',
      }}
    >
      {cssCheck.valid && cssCheck.scopedCss && <style>{cssCheck.scopedCss}</style>}
      <div
        className="bd-widget-card border transition-all"
        style={{
          backgroundColor: s.backgroundColor,
          color: s.textColor,
          borderColor: s.borderColor,
          fontFamily: s.fontFamily,
          fontSize: `${s.fontSizePx}px`,
          padding: `${s.paddingPx}px`,
          borderRadius: `${s.borderRadiusPx}px`,
          boxShadow: shadowMap[s.shadow] || 'none',
          textAlign: s.alignment,
        }}
      >
        {PART_1_TYPES.has(type) ? (
          <UiWidgetsPart1
            type={type}
            config={effectiveConfig}
            onEvent={onEvent}
            onDismiss={() => setDismissed(true)}
          />
        ) : PART_2_TYPES.has(type) ? (
          <UiWidgetsPart2
            type={type}
            config={effectiveConfig}
            onEvent={onEvent}
            onDismiss={() => setDismissed(true)}
          />
        ) : (
          <BusinessWidgets
            type={type}
            config={effectiveConfig}
            onEvent={onEvent}
            onDismiss={() => setDismissed(true)}
          />
        )}

        {effectiveConfig.showBranding && (
          <div
            className="mt-3 pt-2 border-t flex items-center justify-end text-[10px] opacity-60"
            style={{ borderColor: s.borderColor }}
          >
            <span>Powered by BrosDev Widgets</span>
          </div>
        )}
      </div>
    </div>
  );
};
