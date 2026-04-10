import './globals.css';

export const metadata = {
  title: 'I.Agro — Companheiro Agrícola',
  icons: { icon: '/img/favicon.png' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
