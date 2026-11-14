import { Button } from "../../ui/components/Button";
import { Icon } from "../../ui/components/icons";
import { transitionTo } from "../../ui/state/transition";

interface Props {
  title?: string;
  message?: string;
}

export function NotFoundScreen({
  title = "Signal lost",
  message = "That route does not map to a mission control screen. Return to the catalog and pick a mission.",
}: Props) {
  return (
    <section class="not-found">
      <p class="eyebrow">404 · NAVIGATION</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <Button variant="primary" onClick={() => transitionTo({ name: "select" }, "Returning home")}>
        <Icon name="arrow-left" />
        Back to missions
      </Button>
    </section>
  );
}
