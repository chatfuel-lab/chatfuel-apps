import { lazy } from "react";
import { IconClipboardList } from "~ui";
import type { ModuleDescriptor } from "../types";

export const moduleDescriptor: ModuleDescriptor = {
  id: "money",
  title: "Money",
  icon: <IconClipboardList />,
  Component: lazy(() => import("./MoneyApp").then((m) => ({ default: m.MoneyApp }))),
};
