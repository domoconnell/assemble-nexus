"use client"

import * as React from "react"

type TabCtx = {
  tabContent: React.ReactNode
  setTabContent: React.Dispatch<React.SetStateAction<React.ReactNode>>
}

const TabContext = React.createContext<TabCtx | null>(null)

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [tabContent, setTabContent] = React.useState<React.ReactNode>(null)

  return (
    <TabContext.Provider value={{ tabContent, setTabContent }}>
      {children}
    </TabContext.Provider>
  )
}

export function useTab() {
  const ctx = React.useContext(TabContext)
  if (!ctx) throw new Error("useTab must be used within TabProvider")
  return ctx
}