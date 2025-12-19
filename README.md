# SecretSauce

A comprehensive recipe management and meal planning application with smart grocery price comparison.

## Features

- **Recipe Management** - Create, edit, and organize your recipes
- **Recipe Import** - Import recipes from 400+ websites, Instagram posts, or images (OCR)
- **Meal Planning** - Plan your weekly meals with a drag-and-drop interface
- **Smart Shopping Lists** - Auto-generated shopping lists from your meal plans
- **Grocery Price Comparison** - Compare prices across Walmart, Target, Kroger, and more
- **Pantry Tracking** - Keep track of what ingredients you have on hand
- **Favorites** - Save and organize your favorite recipes
- **User Authentication** - Secure login via Supabase Auth

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Radix UI |
| Database | Supabase (PostgreSQL) |
| Backend API | Python FastAPI on Fly.io |
| Auth | Supabase Auth |
| AI | OpenAI GPT-4o-mini (recipe parsing, ingredient standardization) |
| OCR | Tesseract.js (client-side) |
| Scraping | recipe-scrapers, Instaloader |
| Hosting | Vercel (frontend), Fly.io (Python API) |

## Project Structure

```
SecretSauce/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   │   ├── recipe-import/  # URL, Instagram, image import endpoints
│   │   ├── grocery-search/ # Price comparison endpoints
│   │   └── ingredients/    # Ingredient standardization
│   ├── recipes/            # Recipe browsing and details
│   ├── upload-recipe/      # Recipe creation and import
│   ├── meal-planner/       # Weekly meal planning
│   ├── shopping/           # Shopping list generation
│   ├── pantry/             # Pantry management
│   ├── favorites/          # Saved recipes
│   └── settings/           # User settings
├── components/             # Reusable React components
├── lib/                    # Utilities, types, and services
│   ├── ocr-service.ts      # Tesseract.js OCR
│   └── types/              # TypeScript interfaces
├── python-api/             # FastAPI backend (Fly.io)
│   ├── main.py             # API endpoints
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile          # Container config
├── scripts/                # Utility scripts
└── migrations/             # Database migrations
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Python 3.11+ (for backend development)
- Supabase account
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/SecretSauce.git
   cd SecretSauce
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env.local
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

### Environment Variables

Create a `.env.local` file with:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Python API Service (Fly.io)
NEXT_PUBLIC_PYTHON_SERVICE_URL=https://your-app.fly.dev/
PYTHON_SERVICE_URL=https://your-app.fly.dev/

# OpenAI - Required for recipe parsing
OPENAI_API_KEY=sk-your_openai_api_key

# Google Maps (optional)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Python Backend (Fly.io)

The Python API handles recipe scraping, Instagram imports, and AI-powered text parsing.

### Local Development

```bash
cd python-api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Deployment

```bash
cd python-api
fly launch --no-deploy
fly secrets set OPENAI_API_KEY=sk-...
fly deploy
```

See `python-api/FLY_SETUP.md` for detailed deployment instructions.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm warm-cache` | Pre-warm ingredient price cache |
| `pnpm warm-cache:top100` | Cache top 100 ingredients |

## Recipe Import

SecretSauce supports three import methods:

1. **URL Import** - Paste a recipe URL from 400+ supported sites
2. **Instagram Import** - Import from public Instagram post URLs
3. **Image Import** - Upload a photo of a recipe (uses OCR)

All imports are processed and can be edited before saving.

## Database Schema

Key tables in Supabase:
- `recipes` - Recipe storage with JSONB for ingredients/instructions
- `standardized_ingredients` - Canonical ingredient dictionary
- `ingredient_mappings` - Links recipe ingredients to canonical names
- `ingredient_cache` - Cached grocery prices per store
- `meal_plans` - User meal planning data
- `profiles` - User profiles and preferences

## License

Private repository - All rights reserved
