import React from 'react';
import { Composition } from 'remotion';
import { VideoScenes } from './VideoScenes';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CodeFlowPromo"
      component={VideoScenes}
      durationInFrames={4800}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
