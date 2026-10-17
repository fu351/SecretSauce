# Find recipe URLs with Parallel Search MCP

Use [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
in an external assistant to find recipe pages, then import a chosen URL into
SecretSauce. It provides free web search and page fetching without a Parallel
account or API key. Anonymous search uses Fast mode and has usage limits.

This is an optional workflow in your MCP client. SecretSauce does not connect to
the MCP server or automatically import its results.

## Connect Claude Code

With [Claude Code installed](https://code.claude.com/docs/en/setup), run these
commands from the directory where you want to research recipes:

```sh
claude mcp add --scope local --transport http parallel-search https://search.parallel.ai/mcp --header "User-Agent: SecretSauce/recipe-discovery"
claude mcp get parallel-search
```

The `local` scope keeps this server private to you in that directory. It does not
create a shared repository configuration. If `parallel-search` already exists,
inspect it with `claude mcp get` before choosing a different name or changing it.
The connection should show `Connected`. Start a new Claude Code session in the
same directory and use `/mcp` to check that `web_search` and `web_fetch` are
available. Approve tool use when prompted. Using Claude Code itself requires its
usual authentication; the Parallel endpoint above needs no credentials.

For another MCP client, add `https://search.parallel.ai/mcp` using its HTTP
(Streamable HTTP) transport. See the [client setup options](https://docs.parallel.ai/integrations/mcp/search-mcp#installation).

## Find and inspect a recipe

Try this prompt in your connected assistant:

> Use Parallel's web_search to find three vegetarian chickpea dinner recipes
> with published total times of 30 minutes or less. Return the recipe title,
> original recipe-page URL, and stated total time for each. Use web_fetch on the
> best candidate to check its ingredients and instructions. Report missing
> information rather than guessing. Keep links to the original sources.

Open the original recipe page and check the ingredients, servings, and timing
yourself. Keep the page's URL rather than a search-results URL or an assistant's
summary. Fetching a page through MCP does not guarantee SecretSauce's importer
supports that site.

## Import the chosen URL

1. Sign in to SecretSauce and open `/upload-recipe` (**Add Recipe**).
2. Select **Import Recipe**, then **URL**.
3. Paste the original recipe-page URL into **Recipe URL** and select
   **Import from URL**.
4. Review the extracted details in **Manual Entry**, correct any missing or
   inaccurate fields, and save the recipe. If the quality dialog appears, review
   the flagged details before continuing.

The URL importer still uses SecretSauce's Python recipe-import service. For a
local deployment, configure `PYTHON_SERVICE_URL` to a running Python API as
described in [API and Integrations](./api-and-integrations.md). MCP setup does
not replace that service. If a site cannot be imported, use **Manual Entry** to
enter the recipe yourself.

## Troubleshooting and removal

- If the MCP connection fails, check the endpoint and HTTP transport with
  `claude mcp get parallel-search`; see [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp).
- If Parallel reports a usage limit, wait for the indicated retry time. Higher
  limits and authenticated setup are covered in the [Parallel setup guide](https://docs.parallel.ai/integrations/mcp/search-mcp).
- To remove the optional server from the same directory:

  ```sh
  claude mcp remove parallel-search --scope local
  ```
