'use client';
import React from "react";

import SceneEditor from "../editor";
import Menu from "../menu";

type Props = { params: { id: string } };
const ScenePage: React.FunctionComponent<Props> = ({ params }) => {
  return (
    <>
      <Menu />
      <SceneEditor id={params.id} />
    </>
  );
};
export default ScenePage;
