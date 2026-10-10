import './App.css'

const navItems = ['Discover', 'Trending', 'Closet', 'Saved']

const recommendations = [
  {
    name: 'Soft Tailored Coat',
    brand: 'Maison de Lune',
    price: '$238',
    style: 'Warm neutrals',
    image:
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Leather Mini',
    brand: 'Vanta Atelier',
    price: '$189',
    style: 'Night out',
    image:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Silk Statement Set',
    brand: 'Veloura',
    price: '$210',
    style: 'Fluid layers',
    image:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  },
]

const savedLooks = [
  { name: 'Cinnamon layers', time: '2h ago' },
  { name: 'Weekend ease', time: '1d ago' },
  { name: 'City minimal', time: '3d ago' },
]

function App() {
  return (
    <div className="fashion-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div className="brand-copy">
            <span>Fashion</span>
            <strong>Vibe</strong>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Main navigation">
          {navItems.map((item, index) => (
            <button
              key={item}
              type="button"
              className={index === 0 ? 'nav-item active' : 'nav-item'}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="promo-card">
          <p>Season drop</p>
          <h3>Autumn Luxe</h3>
          <button type="button">View edit</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <label className="search-box" aria-label="Search fashion recommendations">
            <span aria-hidden="true">⌕</span>
            <input type="text" placeholder="Search looks, brands..." />
          </label>

          <div className="user-pill">
            <div className="avatar">AR</div>
            <div>
              <strong>Ariana</strong>
              <small>Premium</small>
            </div>
          </div>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Curated for you</p>
            <h1>Dress for the mood, not the schedule.</h1>
            <p className="hero-text">
              Build your day around soft structure, rich neutrals, and pieces that feel
              like a quiet power move.
            </p>

            <div className="hero-actions">
              <button type="button" className="primary-btn">
                Start styling
              </button>
              <button type="button" className="secondary-btn">
                My closet
              </button>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-card">
              <div className="visual-image" aria-hidden="true" />
              <div className="visual-meta">
                <span>Soft drama</span>
                <strong>Monochrome edit</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="content-grid">
          <div className="recommend-panel">
            <div className="section-header">
              <div>
                <p className="mini-label">Recommended now</p>
                <h2>Trending looks</h2>
              </div>
              <button type="button" className="link-btn">
                See all
              </button>
            </div>

            <div className="recommend-grid">
              {recommendations.map((item) => (
                <article key={item.name} className="look-card">
                  <div
                    className="look-image"
                    style={{ backgroundImage: `url(${item.image})` }}
                    aria-label={item.name}
                  />
                  <div className="look-meta">
                    <div className="look-row">
                      <span>{item.brand}</span>
                      <strong>{item.price}</strong>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.style}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="side-panel">
            <div className="quick-card">
              <p className="mini-label">Style note</p>
              <h3>Warm neutrals are winning this week.</h3>
              <p>
                Pair a rich brown base with soft lilac accents for a polished, low-effort
                statement.
              </p>
            </div>

            <div className="saved-card">
              <div className="section-header compact">
                <h3>Saved looks</h3>
                <span>04</span>
              </div>

              <ul>
                {savedLooks.map((look) => (
                  <li key={look.name}>
                    <span className="dot" aria-hidden="true" />
                    <div>
                      <strong>{look.name}</strong>
                      <small>{look.time}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
