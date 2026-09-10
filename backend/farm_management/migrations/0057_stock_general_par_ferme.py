# Stock général par ferme : les inventaires passent du niveau LOT au niveau FERME.
#  - FeedInventory / HealthInventory : lot -> farm (fusion des doublons par somme)
#  - PreparedFeedInventory : + farm, lot devient optionnel (réserve de lot)
#  - FeedPreparation : + farm, lot devient optionnel

from django.db import migrations, models
import django.db.models.deletion


def _merge(Model, name_field, qty_field):
    """Fusionne les lignes de même (farm, name) en sommant la quantité."""
    seen = {}
    for row in Model.objects.all().order_by('id'):
        key = (row.farm_id, getattr(row, name_field))
        if key in seen:
            keep = seen[key]
            setattr(keep, qty_field, getattr(keep, qty_field) + getattr(row, qty_field))
            keep.save(update_fields=[qty_field])
            row.delete()
        else:
            seen[key] = row


def forwards(apps, schema_editor):
    FeedInventory = apps.get_model('farm_management', 'FeedInventory')
    HealthInventory = apps.get_model('farm_management', 'HealthInventory')
    PreparedFeedInventory = apps.get_model('farm_management', 'PreparedFeedInventory')
    FeedPreparation = apps.get_model('farm_management', 'FeedPreparation')

    for Model in (FeedInventory, HealthInventory, PreparedFeedInventory, FeedPreparation):
        for row in Model.objects.select_related('lot').all():
            if row.lot_id and not row.farm_id:
                row.farm_id = row.lot.farm_id
                row.save(update_fields=['farm_id'])
        # lignes orphelines sans lot ni farm : supprimées
        Model.objects.filter(farm__isnull=True).delete()

    _merge(FeedInventory, 'feed_type', 'quantity_kg')
    _merge(HealthInventory, 'product_name', 'quantity')


def backwards(apps, schema_editor):
    # Migration non réversible proprement (fusion des quantités perdue).
    FeedInventory = apps.get_model('farm_management', 'FeedInventory')
    HealthInventory = apps.get_model('farm_management', 'HealthInventory')
    for Model in (FeedInventory, HealthInventory):
        Model.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('farm_management', '0056_feedpurchase_unit_price_healthpurchase_unit_price'),
    ]

    operations = [
        # 1. Ajout des colonnes farm (nullable le temps de la migration de données)
        migrations.AddField(
            model_name='feedinventory',
            name='farm',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='feed_inventory', to='farm_management.farm'),
        ),
        migrations.AddField(
            model_name='healthinventory',
            name='farm',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='health_inventory', to='farm_management.farm'),
        ),
        migrations.AddField(
            model_name='preparedfeedinventory',
            name='farm',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='prepared_feed_inventory', to='farm_management.farm'),
        ),
        migrations.AddField(
            model_name='feedpreparation',
            name='farm',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='feed_preparations', to='farm_management.farm'),
        ),
        # 2. lot devient optionnel là où c'est voulu
        migrations.AlterField(
            model_name='preparedfeedinventory',
            name='lot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='prepared_feed_inventory', to='farm_management.lot'),
        ),
        migrations.AlterField(
            model_name='feedpreparation',
            name='lot',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='feed_preparations', to='farm_management.lot'),
        ),
        # 3. Migration des données
        migrations.RunPython(forwards, backwards),
        # 4. Bascule des contraintes d'unicité + suppression de lot sur Feed/Health inventory
        migrations.AlterUniqueTogether(name='feedinventory', unique_together=set()),
        migrations.RemoveField(model_name='feedinventory', name='lot'),
        migrations.AlterField(
            model_name='feedinventory',
            name='farm',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='feed_inventory', to='farm_management.farm'),
        ),
        migrations.AlterUniqueTogether(name='feedinventory', unique_together={('farm', 'feed_type')}),

        migrations.AlterUniqueTogether(name='healthinventory', unique_together=set()),
        migrations.RemoveField(model_name='healthinventory', name='lot'),
        migrations.AlterField(
            model_name='healthinventory',
            name='farm',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='health_inventory', to='farm_management.farm'),
        ),
        migrations.AlterUniqueTogether(name='healthinventory', unique_together={('farm', 'product_name')}),

        # 5. farm devient non-null + nouvelle unicité pour l'aliment préparé & les mélanges
        migrations.AlterField(
            model_name='preparedfeedinventory',
            name='farm',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='prepared_feed_inventory', to='farm_management.farm'),
        ),
        migrations.AlterUniqueTogether(
            name='preparedfeedinventory', unique_together={('farm', 'lot', 'feed_name')}
        ),
        migrations.AlterField(
            model_name='feedpreparation',
            name='farm',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='feed_preparations', to='farm_management.farm'),
        ),
    ]
