# Le Rebond maintient un miroir Git autoritaire

Le Rebond clone ou remet les fichiers suivis du Dépôt Ansible sur une branche configurée, puis publie Playbooks et Inventaire comme un snapshot atomique. Une sonde compare les révisions avant toute mise à jour et un verrou gèle le dépôt pendant chaque Run; ce choix privilégie la reproductibilité des Runs tout en conservant le dernier snapshot lisible lors d'une panne Git.

La coordination reste en mémoire et suppose un seul réplica API, comme la file de Runs actuelle. Un déploiement multi-réplica devra remplacer ces verrous par une coordination distribuée. Les fichiers non suivis ou ignorés restent intacts afin de ne pas supprimer de secrets locaux au Rebond.
