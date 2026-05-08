"use client";
import React from "react";

import { useTab } from "@/nexus/layout/site-header-items/tabs-provider";
import { Tabs, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { byPrefixAndName } from "@awesome.me/kit-71c392801a/icons";


export default function HeaderTabs({ tabs, onSwitch }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { setTabContent } = useTab();

    const paramTab = searchParams.get("tab");
    const initialTab = tabs.find((t) => t.value === paramTab) ? paramTab : tabs[0].value;
    const [activeTab, setActiveTab] = React.useState(initialTab);

    // Sync parent with URL param on mount
    React.useEffect(() => {
        if (paramTab && paramTab !== tabs[0].value) {
            const match = tabs.find((t) => t.value === paramTab);
            if (match) onSwitch(match);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSwitch = (tab) => {
        setActiveTab(tab.value);
        const params = new URLSearchParams(searchParams);
        params.set("tab", tab.value);
        router.replace(`${pathname}?${params.toString()}`);
        onSwitch(tab);
    };

    React.useEffect(() => {
        setTabContent(
            <Tabs value={activeTab}>
                <TabsList variant="line">
                    {tabs.map((k) => (
                        <TabsTrigger
                            key={k.value}
                            value={k.value}
                            className="flex gap-2"
                            onClick={() => handleSwitch(k)}
                        >
                            {k.icon && <FontAwesomeIcon icon={byPrefixAndName.fas[k.icon]} />}
                            {k.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        );

        return () => setTabContent(null);
    }, [setTabContent, activeTab]);


    return (<></>);
}