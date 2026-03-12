# Contributing to WritBase

Thank you for your interest in contributing to WritBase! This guide will help you get set up.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Deno](https://deno.land/) 2.x (for Edge Function development)
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2+
- [Docker](https://www.docker.com/) (for local Supabase)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/dynreadme/writbase.git
cd writbase

# Install dependencies
npm install

# Start local Supabase (requires Docker)
supabase start

# Apply migrations
supabase db push

# Start the dev server
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

### Running Tests

```bash
# Run all Node.js tests (Vitest)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Run Edge Function tests (Deno)
npm run test:edge

# Lint
npm run lint          # ESLint for Next.js
npm run lint:deno     # Deno lint for Edge Functions

# Format
npm run format        # Biome formatter
npm run format:check  # Check formatting (CI)
```

### Project Structure

```
src/
  app/               # Next.js App Router pages and layouts
    (dashboard)/     # Dashboard routes and server actions
    api/             # Route Handlers (GET endpoints)
  components/        # React components
  lib/
    services/        # Business logic (shared by UI and API)
    types/           # TypeScript types and Zod schemas

supabase/
  functions/
    _shared/         # Shared Edge Function modules
    mcp-server/      # MCP server (Hono + MCP SDK)
      middleware/     # Auth, rate limiting
      schema/        # Dynamic schema generation
      tools/         # Tool implementations (11 tools)
  migrations/        # Postgres migrations (20 files)

scripts/             # Deno utility scripts
docs/                # Documentation
```

## Making Changes

### Code Style

- **TypeScript** everywhere — no `any` types without justification
- **Biome** for formatting (`npm run format`)
- **ESLint** for Next.js linting
- **Deno lint** for Edge Functions

### Commit Messages

Use concise, descriptive commit messages that explain the "why":

```
Add cursor pagination to get_tasks for large result sets
Fix permission check bypassing department scope on update
```

### Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with tests
3. Ensure all checks pass: `npm run format:check && npm run lint && npm run build && npm test`
4. Open a PR with a clear description of what and why
5. Fill out the PR template checklist

### Testing Guidelines

- Write tests for new functionality
- Node.js tests use **Vitest** (`src/**/*.test.ts`)
- Edge Function tests use **Deno test** (`supabase/functions/**/*_test.ts`)
- Test both success and error paths
- For permission-related changes, test authorization boundaries

### Database Changes

- Create new migrations with `supabase migration new <name>`
- Migrations should be idempotent where possible
- Include both up and down logic (or document why down is not supported)
- Test migrations against a fresh database: `supabase db reset`

## Areas for Contribution

- Bug fixes and error handling improvements
- Documentation improvements
- Test coverage expansion
- MCP client compatibility testing
- Performance optimizations
- Integration examples with agent frameworks

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
