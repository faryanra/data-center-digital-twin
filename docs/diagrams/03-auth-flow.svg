<svg viewBox="0 0 840 480" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <defs>
    <marker id="af" markerWidth="9" markerHeight="9" refX="7.5" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#94A3B8"/>
    </marker>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="1.5" refY="4" orient="auto">
      <path d="M8,0 L0,4 L8,8 Z" fill="#94A3B8"/>
    </marker>
  </defs>

  <rect x="0.5" y="0.5" width="839" height="479" rx="10" fill="#FAFBFC" stroke="#E5E7EB"/>
  <text x="28" y="38" font-size="17" font-weight="700" fill="#374151">Auth &amp; Request Flow</text>

  <!-- actor headers -->
  <rect x="70"  y="58" width="140" height="40" rx="9" fill="#E8F1FF" stroke="#2563EB" stroke-width="1.5"/>
  <text x="140" y="83" text-anchor="middle" font-size="14.5" font-weight="600" fill="#1D4ED8">Browser</text>

  <rect x="350" y="58" width="140" height="40" rx="9" fill="#E8F1FF" stroke="#2563EB" stroke-width="1.5"/>
  <text x="420" y="83" text-anchor="middle" font-size="14.5" font-weight="600" fill="#1D4ED8">Next.js</text>

  <rect x="630" y="58" width="140" height="40" rx="9" fill="#E7F6EC" stroke="#16A34A" stroke-width="1.5"/>
  <text x="700" y="83" text-anchor="middle" font-size="14.5" font-weight="600" fill="#15803D">FastAPI</text>

  <!-- lifelines -->
  <line x1="140" y1="98" x2="140" y2="462" stroke="#CBD5E1" stroke-width="1.4" stroke-dasharray="5 5"/>
  <line x1="420" y1="98" x2="420" y2="462" stroke="#CBD5E1" stroke-width="1.4" stroke-dasharray="5 5"/>
  <line x1="700" y1="98" x2="700" y2="462" stroke="#CBD5E1" stroke-width="1.4" stroke-dasharray="5 5"/>

  <!-- 1 login -->
  <text x="280" y="128" text-anchor="middle" font-size="13" fill="#374151">POST /login</text>
  <line x1="140" y1="136" x2="420" y2="136" stroke="#94A3B8" stroke-width="1.6" marker-end="url(#af)"/>

  <!-- 2 -->
  <text x="560" y="162" text-anchor="middle" font-size="13" fill="#374151">POST /auth/login</text>
  <line x1="420" y1="170" x2="700" y2="170" stroke="#94A3B8" stroke-width="1.6" marker-end="url(#af)"/>

  <!-- verify box -->
  <rect x="612" y="184" width="176" height="36" rx="7" fill="#E7F6EC" stroke="#16A34A" stroke-width="1.2"/>
  <text x="700" y="207" text-anchor="middle" font-size="12.5" font-weight="600" fill="#15803D">verify + sign JWT</text>

  <!-- 3 set-cookie back -->
  <text x="560" y="246" text-anchor="middle" font-size="13" fill="#374151">Set-Cookie (JWT)</text>
  <line x1="420" y1="254" x2="700" y2="254" stroke="#94A3B8" stroke-width="1.6" marker-start="url(#ar)"/>

  <!-- 4 to browser -->
  <text x="280" y="280" text-anchor="middle" font-size="13" fill="#374151">httpOnly cookie</text>
  <line x1="140" y1="288" x2="420" y2="288" stroke="#94A3B8" stroke-width="1.6" marker-start="url(#ar)"/>

  <!-- divider -->
  <line x1="28" y1="308" x2="812" y2="308" stroke="#E5E7EB" stroke-width="1"/>

  <!-- 5 protected request -->
  <text x="280" y="332" text-anchor="middle" font-size="13" fill="#374151">GET /api/proxy/*</text>
  <line x1="140" y1="340" x2="420" y2="340" stroke="#94A3B8" stroke-width="1.6" marker-end="url(#af)"/>

  <!-- 6 forward -->
  <text x="560" y="366" text-anchor="middle" font-size="13" fill="#374151">forward + role header</text>
  <line x1="420" y1="374" x2="700" y2="374" stroke="#94A3B8" stroke-width="1.6" marker-end="url(#af)"/>

  <!-- role box -->
  <rect x="604" y="388" width="192" height="36" rx="7" fill="#E7F6EC" stroke="#16A34A" stroke-width="1.2"/>
  <text x="700" y="411" text-anchor="middle" font-size="12.5" font-weight="600" fill="#15803D">require_operator / admin</text>

  <!-- 7 response -->
  <text x="420" y="448" text-anchor="middle" font-size="13" fill="#374151">200 OK  /  403 Forbidden</text>
  <line x1="140" y1="458" x2="700" y2="458" stroke="#94A3B8" stroke-width="1.6" marker-start="url(#ar)"/>
</svg>
