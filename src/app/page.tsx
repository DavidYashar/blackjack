import { redirect } from 'next/navigation';

/** One game, one address: the root hands the player straight into it. */
export default function Root() {
  redirect('/app');
}
