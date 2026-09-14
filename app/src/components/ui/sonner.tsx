/*
 * Toaster:sonner 的项目封装。不依赖 next-themes,改为监听 <html data-theme>
 * (tokens.css 的明暗机制)同步 toast 配色;颜色走 shadcn 语义变量。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// 订阅 <html data-theme> 变化,把属性值作为外部数据源接入 React。
function subscribeDataTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  })
  return () => observer.disconnect()
}

function useDataTheme(): string {
  return useSyncExternalStore(
    subscribeDataTheme,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDataTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
