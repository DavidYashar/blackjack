import { Home } from './home';

// The surface reads ?play and ?help, so it renders per request rather than being
// prerendered without them.
export const dynamic = 'force-dynamic';

export default function App() {
  return <Home />;
}
