"use client";
import React from "react";

import SceneEditor from "@/app/scenes/editor";
import Menu from "@/app/scenes/menu";

type Props = { params: { campaignId: string; sceneId: string } };
const ScenePage: React.FunctionComponent<Props> = ({ params }) => {
  return (
    <>
      <Menu
        campaignId={params.campaignId}
        sceneId={`${params.campaignId}/${params.sceneId}`}
      />
      <SceneEditor id={`${params.campaignId}/${params.sceneId}`} />
    </>
  );
};
export default ScenePage;
