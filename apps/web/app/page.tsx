import { getProjectStats } from '../lib/data';
import { Nav } from '../components/Nav';
import { Hero } from '../components/Hero';
import { Stats } from '../components/Stats';
import { LoopDiagram } from '../components/LoopDiagram';
import { Features } from '../components/Features';
import { TuiShowcase } from '../components/TuiShowcase';
import { Commands } from '../components/Commands';
import { Footer } from '../components/Footer';

export default async function Home() {
  const stats = await getProjectStats();
  return (
    <>
      <Nav version={stats.version} repoUrl={stats.repoUrl} npmUrl={stats.npmUrl} />
      <main>
        <Hero version={stats.version} repoUrl={stats.repoUrl} />
        <Stats stats={stats} />
        <LoopDiagram />
        <Features />
        <TuiShowcase />
        <Commands />
      </main>
      <Footer repoUrl={stats.repoUrl} npmUrl={stats.npmUrl} />
    </>
  );
}
