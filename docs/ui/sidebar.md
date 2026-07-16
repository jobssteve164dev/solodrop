# Sidebar Experience

## Action model

The sidebar has one primary action: share the selected artifact. Dragging a file is the fastest entry; the active editor and file picker are equivalent inputs to the same action.

## Structure

1. Product identity and one-line outcome.
2. Drop/share card showing the exact artifact, type and size.
3. One primary **Share preview** action and one secondary **Choose a file** action.
4. Completed-share confirmation with public-link actions and a separate ownership action when required.
5. Recent previews for reopening delivered results.

## Visual system

- Use VS Code semantic colors and font tokens so light, dark and high-contrast themes remain native.
- Brand accent: `#5B5CE2`; use it for the primary action, focus and Logo, not for explanatory decoration.
- Spacing follows a compact 4/8px rhythm suitable for a 240–360px VS Code sidebar.
- The Logo is a drop containing a downward delivery arrow, provided as source SVG and Marketplace PNG.
- Motion is limited to loading and drag-state feedback and respects `prefers-reduced-motion`.

## Interaction rules

- Dragging over the share card replaces its contents with a clear release target.
- Explorer URI drops use the original local file; operating-system drops up to 5 MB use a temporary isolated copy.
- Sharing never starts silently: the final filename and size are confirmed unless the user disables confirmation.
- Claim URLs are never presented as public share links.
- Errors include a recovery action or a specific next step.
