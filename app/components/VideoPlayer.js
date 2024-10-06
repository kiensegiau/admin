import ReactPlayer from 'react-player';

export default function VideoPlayer({ src }) {
  
  return (
    <ReactPlayer
      url={src}
      controls
      
      config={{
        file: {
          forceHLS: true,
        }
      }}
    />
  );
}
