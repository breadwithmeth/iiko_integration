import { RefreshCcw } from "lucide-react";
import { useOrganizations, usePaymentTypes, useSyncDirectories, useSyncMenu } from "../api/hooks";

export function SettingsIikoPage() {
  const organizations = useOrganizations();
  const paymentTypes = usePaymentTypes(organizations.data?.[0]?.iikoId);
  const syncDirectories = useSyncDirectories();
  const syncMenu = useSyncMenu();

  return (
    <section className="page-panel">
      <h1>Настройки iiko</h1>
      <div className="actions-row">
        <button className="secondary-button" onClick={() => syncDirectories.mutate()} disabled={syncDirectories.isPending}><RefreshCcw size={17} /> Синхронизировать справочники</button>
        <button className="secondary-button" onClick={() => syncMenu.mutate()} disabled={syncMenu.isPending}><RefreshCcw size={17} /> Обновить меню</button>
      </div>
      <h2>Организации</h2>
      <table className="data-table">
        <tbody>
          {organizations.data?.map((org) => <tr key={org.iikoId}><td>{org.name}</td><td>{org.iikoId}</td></tr>)}
        </tbody>
      </table>
      <h2>Типы оплат</h2>
      <table className="data-table">
        <tbody>
          {paymentTypes.data?.map((type) => <tr key={type.iikoId}><td>{type.name}</td><td>{type.kind}</td><td>{type.iikoId}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
