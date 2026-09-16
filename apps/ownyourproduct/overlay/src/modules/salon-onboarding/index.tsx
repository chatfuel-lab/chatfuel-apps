import { lazy } from "react";
import { IconSparkles } from "~ui";
import type { ModuleDescriptor } from "../types";

export const moduleDescriptor: ModuleDescriptor = {
  id: "salon-onboarding",
  title: "Set-up",
  icon: <IconSparkles />,
  Component: lazy(() => import("./SalonOnboardingApp").then((m) => ({ default: m.SalonOnboardingApp }))),
};
