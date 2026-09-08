// Mini-painel decorativo da tela de login: barras que sobem, linha que se
// desenha e ponto que pulsa. E so SVG + CSS — nada de dado real aqui, para a
// tela de entrada nao depender de rede nem vazar numero de cliente.
const BARRAS = [34, 52, 41, 68, 58, 86];

export default function Vitrine() {
  const largura = 26, vao = 12, base = 128;
  return (
    <svg className="vitrine" viewBox="0 0 260 160" role="presentation" focusable="false">
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className="vitrine-grade" x1="8" x2="252"
          y1={32 + i * 32} y2={32 + i * 32} />
      ))}

      {BARRAS.map((h, i) => (
        <rect key={i} className="vitrine-barra"
          x={14 + i * (largura + vao)} y={base - h}
          width={largura} height={h} rx="4"
          style={{ animationDelay: `${180 + i * 90}ms` }} />
      ))}

      <path className="vitrine-linha"
        d="M27 96 L65 78 L103 86 L141 54 L179 62 L217 30" />
      <circle className="vitrine-ponto" cx="217" cy="30" r="4.5" />
      <line className="vitrine-eixo" x1="8" y1={base} x2="252" y2={base} />
    </svg>
  );
}
