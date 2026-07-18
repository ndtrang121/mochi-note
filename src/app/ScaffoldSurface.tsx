import { Brand } from '../components/ui/Brand';
import { Surface } from '../components/ui/Surface';

interface ScaffoldSurfaceProps {
  description: string;
  title: string;
}

export function ScaffoldSurface({ description, title }: ScaffoldSurfaceProps) {
  return (
    <main className="scaffold-surface">
      <Surface className="scaffold-card" raised>
        <Brand />
        <h1 className="sr-only">{title}</h1>
        <p className="scaffold-description">{description}</p>
      </Surface>
    </main>
  );
}
