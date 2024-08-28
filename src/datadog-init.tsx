"use client";

import { datadogRum } from "@datadog/browser-rum";

if (process.env.NEXT_PUBLIC_RUM_APP_ID && process.env.NEXT_PUBLIC_RUM_TOKEN && process.env.NEXT_PUBLIC_VERCEL_ENV) {
  datadogRum.init({
    applicationId: process.env.NEXT_PUBLIC_RUM_APP_ID,
    clientToken: process.env.NEXT_PUBLIC_RUM_TOKEN,
    site: "datadoghq.com",
    service: "app.fantassist.io",
    env: process.env.NEXT_PUBLIC_VERCEL_ENV,

    // Specify a version number to identify the deployed version of your application in Datadog
    version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
    allowedTracingUrls: [],
  });
}

export default function DatadogInit() {
  return null;
}
