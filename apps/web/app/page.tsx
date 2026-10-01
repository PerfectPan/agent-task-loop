import { getProjectStats } from '../lib/data';
import { Nav } from '../components/nav';
import { Hero } from '../components/hero';
import { Stats } from '../components/stats';
import { LoopDiagram } from '../components/loop-diagram';
import { Features } from '../components/features';
import { TuiShowcase } from '../components/tui-showcase';
import { Commands } from '../components/commands';
import { Footer } from '../components/footer';

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
