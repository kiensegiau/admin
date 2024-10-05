import ReactPlayer from 'react-player';

export default function VideoPlayer({ src }) {
  return (
    <ReactPlayer
      url={src}
      controls
      width="100%"
      height="auto"
      config={{
        file: {
          forceHLS: true,
        }
      }}
    />
  );
}
