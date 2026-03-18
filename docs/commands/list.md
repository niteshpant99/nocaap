# nocaap list

List installed context packages.

## Usage

```bash
nocaap list
nocaap ls
```

## Examples

```bash
nocaap list
```

Example output:

```
Installed context packages:

  engineering     git@github.com:your-org/context-hub.git  /standards/engineering
  design-system   git@github.com:your-org/context-hub.git  /design
  security        git@github.com:your-org/api-docs.git     /
```

## Notes

- Reads from `.context/context.config.json`
- `ls` is a shorthand alias for `list`
