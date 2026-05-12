"use client";
import HeaderTabs from "@/nexus/layout/site-header-items/tabs";
import React, { useState } from "react";
import MyAccount_Overview from "@/nexus/app/app_sections/account/overview";
import MyAccount_Authentication from "@/nexus/app/app_sections/account/authentication";


const tabs = [
    {
        label: "Overview",
        value: "overview",
        icon: "user"
    },
    {
        label: "Authentication",
        value: "authentication",
        icon: "fingerprint"
    }
];

export default function MyAccount() {
    const [activeTab, setActiveTab] = useState(tabs[0].value)

    const switchTab = (tab) => {
        setActiveTab(tab.value);
    };

    return (
        <div>
            <HeaderTabs tabs={tabs} onSwitch={switchTab} />
            {activeTab === "overview" && <MyAccount_Overview />}
            {activeTab === "authentication" && <MyAccount_Authentication />}
        </div>
    );
}