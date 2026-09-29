/**
 * One `<script type="application/ld+json">` per call, serialised once here so
 * every schema on the site goes through the same escaping rather than each
 * caller hand-rolling its own `dangerouslySetInnerHTML`.
 *
 * `</script>` inside a JSON string would otherwise close the tag early if it
 * appeared in a title or FAQ answer — escaped defensively even though nothing
 * in this site's own copy contains it today, because a future answer might.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
