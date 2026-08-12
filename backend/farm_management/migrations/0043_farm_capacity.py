from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('farm_management', '0042_farm_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='farm',
            name='capacity',
            field=models.IntegerField(default=0),
        ),
    ]
