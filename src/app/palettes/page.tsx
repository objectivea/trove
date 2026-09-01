import { listReferences } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { PaletteStudio } from "@/components/PaletteStudio";

export const dynamic = "force-dynamic";

export default async function PalettesPage() {
  const references = await listReferences({ limit: 200 });
  return (
    <div className="shell">
      <Nav active="Palettes" />
      <PaletteStudio references={references.filter((r) => r.palette.length > 0)} />
    </div>
  );
}
