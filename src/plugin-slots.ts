export function mergePluginSlots<TPlugin extends { readonly id: string }>(
  ...groups: readonly (readonly TPlugin[])[]
): TPlugin[] {
  const output: TPlugin[] = [];
  const indexes = new Map<string, number>();
  for (const plugin of groups.flat()) {
    const index = indexes.get(plugin.id);
    if (index === undefined) {
      indexes.set(plugin.id, output.length);
      output.push(plugin);
    } else {
      output[index] = plugin;
    }
  }
  return output;
}
