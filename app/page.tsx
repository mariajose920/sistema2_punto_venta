import { redirect } from 'next/navigation';

export default function Home() {
  // Redirigimos automáticamente la raíz del sitio al login
  redirect('/login');
}
