import { lazy } from "react";
import { IconInstagram } from "~ui";
import type { ModuleDescriptor } from "../types";

export const moduleDescriptor: ModuleDescriptor = {
  id: "comment-studio",
  title: "Comment Studio",
  icon: <IconInstagram />,
  Component: lazy(() => import("./CommentStudioApp").then((m) => ({ default: m.CommentStudioApp }))),
};
