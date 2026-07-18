interface ScaffoldSurfaceProps {
  description: string;
  eyebrow: string;
  title: string;
}

export function ScaffoldSurface({ description, eyebrow, title }: ScaffoldSurfaceProps) {
  return (
    <main className="scaffold-surface">
      <div className="scaffold-mark" aria-hidden="true">
        M
      </div>
      <p className="scaffold-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="scaffold-description">{description}</p>
    </main>
  );
}
